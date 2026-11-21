import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

// The module and viem's not-found errors in one bundle, so the fake RPC throws the same classes
// the module checks for.
const { outputFiles } = await build({
  stdin: {
    contents: `
      export * from "./follow-transaction.ts";
      export { TransactionNotFoundError, TransactionReceiptNotFoundError } from "viem";
    `,
    resolveDir: path.join(repoRoot, "src/lib/names"),
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "browser",
  write: false,
});
const { checkFollowed, settleFollowed, TransactionNotFoundError, TransactionReceiptNotFoundError } =
  await import(
    `data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`
  );

const visitor = "0xe2eea174e91611ee38705365c2fa11f9c31029b1";
const registry = "0x5fbdb2315678afecb367f032d93f642f64180aa3";
const renewCall = "0x0d4a3c9b0000000000000000000000000000000000000000000000000000000000000001";
let hashes = 0;
const nextHash = () => `0x${(++hashes).toString(16).padStart(64, "0")}`;

/**
 * A chain and the view a public RPC has of it. The RPC forgets a pending transaction once it is
 * replaced or dropped, as nodes do, and the visitor's nonce starts at 7.
 */
function fakeChain() {
  const blocks = [{ number: 100n, transactions: [] }];
  const pending = new Map();
  const reads = [];
  const head = () => blocks.at(-1).number;
  const mined = (hash) => {
    for (const block of blocks) {
      const tx = block.transactions.find((candidate) => candidate.hash === hash);
      if (tx) return { tx, block };
    }
    return null;
  };
  const rpc = {
    async getTransactionReceipt({ hash }) {
      reads.push("receipt");
      const found = mined(hash);
      if (!found) throw new TransactionReceiptNotFoundError({ hash });
      return {
        transactionHash: hash,
        blockNumber: found.block.number,
        status: found.tx.reverts ? "reverted" : "success",
      };
    },
    async getTransaction({ hash }) {
      reads.push("transaction");
      const tx = pending.get(hash) ?? mined(hash)?.tx;
      if (!tx) throw new TransactionNotFoundError({ hash });
      return tx;
    },
    async getBlockNumber() {
      reads.push("head");
      return head();
    },
    async getTransactionCount({ address, blockNumber }) {
      reads.push("count");
      let count = 7;
      for (const block of blocks) {
        if (block.number > blockNumber) break;
        count += block.transactions.filter((tx) => tx.from === address).length;
      }
      return count;
    },
    async getBlock({ blockNumber }) {
      reads.push("block");
      const block = blocks.find((candidate) => candidate.number === blockNumber);
      return { transactions: block.transactions };
    },
  };
  const chain = {
    rpc,
    reads,
    head,
    send(fields = {}) {
      const tx = {
        hash: nextHash(),
        from: visitor,
        nonce: 7,
        to: registry,
        value: 10n ** 15n,
        input: renewCall,
        ...fields,
      };
      pending.set(tx.hash, tx);
      return tx;
    },
    // The wallet's speed-up: the same call at a higher fee, under a new hash and the same nonce.
    speedUp(original) {
      pending.delete(original.hash);
      return chain.send({ ...original, hash: nextHash() });
    },
    cancel(original) {
      pending.delete(original.hash);
      return chain.send({ nonce: original.nonce, to: visitor, value: 0n, input: "0x" });
    },
    drop(tx) {
      pending.delete(tx.hash);
    },
    mine(...txs) {
      for (const tx of txs) pending.delete(tx.hash);
      blocks.push({ number: head() + 1n, transactions: txs });
    },
  };
  return chain;
}

/** Sends a renewal as the page does: the head is read first, then the wallet signs. */
function sendFollowed(chain) {
  const openAt = chain.head();
  const tx = chain.send();
  return { tx, followed: { hash: tx.hash, openAt } };
}

test("a mined transaction settles with its own receipt", async () => {
  const chain = fakeChain();
  const { tx, followed } = sendFollowed(chain);
  assert.equal(await checkFollowed(chain.rpc, followed), null);
  chain.mine(tx);
  const settled = await checkFollowed(chain.rpc, followed);
  assert.equal(settled.replaced, false);
  assert.equal(settled.receipt.transactionHash, tx.hash);
});

test("a speed-up the RPC shows only after forgetting the original settles as the same call", async () => {
  const chain = fakeChain();
  const { tx, followed } = sendFollowed(chain);
  assert.equal(await checkFollowed(chain.rpc, followed), null, "seen while pending");
  const faster = chain.speedUp(tx);
  chain.mine();
  chain.mine(faster);

  // A check that starts over without what the first one saw can't tell the speed-up is this
  // transaction: the RPC no longer knows the original, so its nonce is unknown.
  assert.equal(await checkFollowed(chain.rpc, { hash: tx.hash, openAt: followed.openAt }), null);

  const settled = await checkFollowed(chain.rpc, followed);
  assert.equal(settled.replaced, false);
  assert.equal(settled.receipt.transactionHash, faster.hash);
  assert.equal(settled.receipt.blockNumber, 102n);
});

test("a cancelled transaction settles as replaced", async () => {
  const chain = fakeChain();
  const { tx, followed } = sendFollowed(chain);
  await checkFollowed(chain.rpc, followed);
  chain.mine(chain.cancel(tx));
  const settled = await checkFollowed(chain.rpc, followed);
  assert.equal(settled.replaced, true);
  assert.equal(settled.receipt.blockNumber, 101n);
});

test("a dropped transaction stays unsettled until its nonce is used", async () => {
  const chain = fakeChain();
  const { tx, followed } = sendFollowed(chain);
  await checkFollowed(chain.rpc, followed);
  chain.drop(tx);
  for (let block = 0; block < 5; block += 1) {
    chain.mine();
    assert.equal(await checkFollowed(chain.rpc, followed), null, "its nonce can still be mined");
  }
  assert.equal(followed.openAt, 105n);
  chain.mine(chain.cancel(tx));
  const settled = await checkFollowed(chain.rpc, followed);
  assert.equal(settled.replaced, true);
  assert.equal(settled.receipt.blockNumber, 106n);
});

test("the block that used the nonce is found among many since the last check", async () => {
  const chain = fakeChain();
  const { tx, followed } = sendFollowed(chain);
  await checkFollowed(chain.rpc, followed);
  const faster = chain.speedUp(tx);
  for (let block = 0; block < 20; block += 1) chain.mine(...(block === 12 ? [faster] : []));
  chain.reads.length = 0;
  const settled = await checkFollowed(chain.rpc, followed);
  assert.equal(settled.receipt.blockNumber, 113n);
  assert.equal(chain.reads.filter((read) => read === "block").length, 1, "reads one block");
});

test("a reverted speed-up settles as the same call, with its failed receipt", async () => {
  const chain = fakeChain();
  const { tx, followed } = sendFollowed(chain);
  await checkFollowed(chain.rpc, followed);
  const faster = chain.speedUp(tx);
  faster.reverts = true;
  chain.mine(faster);
  const settled = await checkFollowed(chain.rpc, followed);
  assert.equal(settled.replaced, false);
  assert.equal(settled.receipt.status, "reverted");
});

test("following again after a stopped wait carries on from what it saw", async () => {
  const chain = fakeChain();
  const { tx, followed } = sendFollowed(chain);
  const controller = new AbortController();
  const first = settleFollowed(chain.rpc, followed, { pollMs: 5, signal: controller.signal });
  await new Promise((resolve) => setTimeout(resolve, 20));
  controller.abort(new Error("stopped"));
  await assert.rejects(first, /stopped/);
  const readsWhenStopped = chain.reads.length;
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(chain.reads.length, readsWhenStopped, "a stopped wait stops reading");

  const faster = chain.speedUp(tx);
  chain.mine(faster);
  const settled = await settleFollowed(chain.rpc, followed, { pollMs: 5 });
  assert.equal(settled.replaced, false);
  assert.equal(settled.receipt.transactionHash, faster.hash);
});

test("an RPC error while following is retried", async (t) => {
  const chain = fakeChain();
  const { tx, followed } = sendFollowed(chain);
  t.mock.method(console, "warn", () => {});
  let failures = 2;
  const flaky = {
    ...chain.rpc,
    async getTransactionReceipt(args) {
      if (failures-- > 0) throw new Error("rate limited");
      return chain.rpc.getTransactionReceipt(args);
    },
  };
  chain.mine(tx);
  const settled = await settleFollowed(flaky, followed, { pollMs: 5 });
  assert.equal(settled.receipt.transactionHash, tx.hash);
});
