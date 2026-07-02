import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BSO_INTENT_ADDRESS,
  encodeIntentCalldata,
  type BsoIntent,
} from "@bitsocial/bso-chain-protocol";
import {
  DerivationNode,
  FileStateStore,
  MemoryStateStore,
  startReadApi,
  TursoStateStore,
} from "@bitsocial/bso-chain-node";
import { createPublicClient, createWalletClient, http, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startDevChain, type DevChainHandle } from "./dev-chain.js";

const alice = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);
const bob = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
);
const KEY_A = "12D3KooWN5rLmRJ8fWMwTtkDN7w2RgPPGRM4mtWTnfbjpi1Sh7zR";
const KEY_B = "12D3KooWN5rLmRJ8fWMwTtkDN7w2RgPPGRM4mtWTnfbjpi1Sh7zA";

let chain: DevChainHandle;
let publicClient: PublicClient;

beforeAll(async () => {
  chain = await startDevChain();
  publicClient = createPublicClient({
    chain: hardhat,
    transport: http(chain.rpcUrl),
    pollingInterval: 50,
  });
});

afterAll(async () => {
  await chain?.stop();
});

async function sendTx(account: PrivateKeyAccount, to: Hex, data: Hex): Promise<number> {
  const wallet = createWalletClient({ account, chain: hardhat, transport: http(chain.rpcUrl) });
  const hash = await wallet.sendTransaction({ to, data });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return Number(receipt.blockNumber);
}

function sendIntent(account: PrivateKeyAccount, intent: BsoIntent): Promise<number> {
  return sendTx(account, BSO_INTENT_ADDRESS as Hex, encodeIntentCalldata(intent));
}

async function freshDerivation(): Promise<DerivationNode> {
  const node = new DerivationNode({ rpcUrl: chain.rpcUrl, store: new MemoryStateStore() });
  await node.init();
  await node.syncOnce();
  return node;
}

async function rpc(method: string, params: unknown[] = []): Promise<unknown> {
  const response = await fetch(chain.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await response.json()) as { result?: unknown; error?: { message: string } };
  if (body.error) {
    throw new Error(`${method} failed: ${body.error.message}`);
  }
  return body.result;
}

describe("derivation node", () => {
  it("derives .bso registry state from L1 history end-to-end", async () => {
    await sendIntent(alice, {
      op: "register",
      name: "alice.bso",
      publicKey: KEY_A,
      metadataUri: "ipfs://m1",
    });
    await sendIntent(bob, { op: "register", name: "alice.bso", publicKey: KEY_B }); // NAME_TAKEN
    await sendIntent(bob, { op: "update", name: "alice.bso", publicKey: KEY_B }); // NOT_OWNER
    await sendIntent(alice, { op: "update", name: "alice.bso", metadataUri: "ipfs://m2" });
    await sendIntent(alice, { op: "transfer", name: "alice.bso", to: bob.address });
    await sendIntent(bob, { op: "register", name: "bob.bso", publicKey: KEY_B });
    // Non-intent calldata to the inbox address: ignored, not recorded.
    await sendTx(alice, BSO_INTENT_ADDRESS as Hex, "0xdeadbeef");
    // Intent calldata sent elsewhere: not an intent at all.
    await sendTx(
      alice,
      bob.address,
      encodeIntentCalldata({ op: "register", name: "elsewhere.bso", publicKey: KEY_A }),
    );

    const node = await freshDerivation();
    const registry = node.getRegistry();

    expect(registry.names["alice.bso"]).toMatchObject({
      owner: bob.address.toLowerCase(),
      publicKey: KEY_A,
      metadataUri: "ipfs://m2",
      version: 3,
      status: "active",
    });
    expect(registry.names["bob.bso"]).toMatchObject({
      owner: bob.address.toLowerCase(),
      version: 1,
      status: "active",
    });
    expect(registry.names["elsewhere.bso"]).toBeUndefined();
    expect(registry.rejected.map((entry) => entry.reason)).toEqual(["NAME_TAKEN", "NOT_OWNER"]);
    expect(registry.acceptedIntents).toBe(4);

    expect(node.resolve("ALICE.bso")).toMatchObject({ status: "active" });
    expect(node.resolve("missing.bso")).toMatchObject({ status: "unregistered" });
  });

  it("two clean derivations from the same L1 history produce the same state", async () => {
    const first = await freshDerivation();
    const second = await freshDerivation();
    expect(first.stateHash()).toBe(second.stateHash());
    expect(first.getStatus().lastProcessedBlock).toEqual(second.getStatus().lastProcessedBlock);
  });

  it("resumes from persisted state without reprocessing old blocks", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bso-node-"));
    const file = join(dir, "state.json");
    try {
      const store = new FileStateStore(file);
      const node = new DerivationNode({ rpcUrl: chain.rpcUrl, store });
      await node.init();
      await node.syncOnce();
      const hash = node.stateHash();
      const processedTo = node.getStatus().lastProcessedBlock;

      const resumed = new DerivationNode({ rpcUrl: chain.rpcUrl, store: new FileStateStore(file) });
      await resumed.init();
      // Already caught up before syncing: persisted cursor was loaded.
      expect(resumed.getStatus().lastProcessedBlock).toEqual(processedTo);
      const sync = await resumed.syncOnce();
      expect(sync.reorged).toBe(false);
      expect(sync.blocksApplied).toBe(0);
      expect(resumed.stateHash()).toBe(hash);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("resumes from Turso persisted state without reprocessing old blocks", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bso-node-turso-"));
    const file = join(dir, "state.db");
    let node: DerivationNode | undefined;
    let resumed: DerivationNode | undefined;
    try {
      node = new DerivationNode({ rpcUrl: chain.rpcUrl, store: new TursoStateStore(file) });
      await node.init();
      await node.syncOnce();
      const hash = node.stateHash();
      const processedTo = node.getStatus().lastProcessedBlock;
      await node.close();
      node = undefined;

      resumed = new DerivationNode({ rpcUrl: chain.rpcUrl, store: new TursoStateStore(file) });
      await resumed.init();
      // Already caught up before syncing: persisted cursor was loaded.
      expect(resumed.getStatus().lastProcessedBlock).toEqual(processedTo);
      const sync = await resumed.syncOnce();
      expect(sync.reorged).toBe(false);
      expect(sync.blocksApplied).toBe(0);
      expect(resumed.stateHash()).toBe(hash);
    } finally {
      await node?.close();
      await resumed?.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("serves derived state over the read API", async () => {
    const node = await freshDerivation();
    await sendIntent(bob, { op: "revoke", name: "alice.bso" });
    await node.syncOnce();
    const api = await startReadApi(node, { port: 0 });
    try {
      const status = (await (await fetch(`${api.endpoint}/v1/status`)).json()) as Record<string, unknown>;
      expect(status.stateHash).toBe(node.stateHash());
      expect(status.intentAddress).toBe(BSO_INTENT_ADDRESS);

      const bobResponse = await fetch(`${api.endpoint}/v1/names/bob.bso`);
      expect(bobResponse.status).toBe(200);
      expect(await bobResponse.json()).toMatchObject({ name: "bob.bso", version: 1 });

      expect((await fetch(`${api.endpoint}/v1/names/alice.bso`)).status).toBe(410);
      expect((await fetch(`${api.endpoint}/v1/names/missing.bso`)).status).toBe(404);
      expect((await fetch(`${api.endpoint}/v1/names/not%20a%20name`)).status).toBe(400);

      const all = (await (await fetch(`${api.endpoint}/v1/names`)).json()) as {
        names: Array<{ name: string }>;
      };
      expect(all.names.map((record) => record.name)).toEqual(["alice.bso", "bob.bso"]);

      const rejected = (await (await fetch(`${api.endpoint}/v1/rejected`)).json()) as {
        rejected: unknown[];
      };
      expect(rejected.rejected).toHaveLength(2);
    } finally {
      await api.close();
    }
  });

  it("detects a same-height reorg and re-derives identical state to a clean node", async () => {
    const node = await freshDerivation();
    const snapshot = await rpc("evm_snapshot");

    await sendIntent(alice, { op: "register", name: "carol.bso", publicKey: KEY_A });
    await node.syncOnce();
    expect(node.resolve("carol.bso")).toMatchObject({ status: "active" });

    // Rewind L1 and build a different history of the same height.
    await rpc("evm_revert", [snapshot]);
    await sendIntent(alice, { op: "register", name: "dave.bso", publicKey: KEY_A });

    const sync = await node.syncOnce();
    expect(sync.reorged).toBe(true);
    expect(node.resolve("carol.bso")).toMatchObject({ status: "unregistered" });
    expect(node.resolve("dave.bso")).toMatchObject({ status: "active" });

    const clean = await freshDerivation();
    expect(node.stateHash()).toBe(clean.stateHash());
  });

  it("detects a head regression and re-derives", async () => {
    const node = await freshDerivation();
    const snapshot = await rpc("evm_snapshot");

    await sendIntent(alice, { op: "register", name: "erin.bso", publicKey: KEY_A });
    await node.syncOnce();
    expect(node.resolve("erin.bso")).toMatchObject({ status: "active" });

    // Rewind without replacement blocks: head is now below the cursor.
    await rpc("evm_revert", [snapshot]);

    const sync = await node.syncOnce();
    expect(sync.reorged).toBe(true);
    expect(node.resolve("erin.bso")).toMatchObject({ status: "unregistered" });

    const clean = await freshDerivation();
    expect(node.stateHash()).toBe(clean.stateHash());
  });
});
