/**
 * End-to-end demo of the Bitsocial Network .bso naming POC.
 *
 * Starts a local Ethereum L1 dev chain, runs a derivation node against it,
 * then drives the full name lifecycle with plain L1 transactions:
 * register → resolve → rejected hijack attempts → update → transfer →
 * revoke — and finally proves determinism by re-deriving the same state
 * from L1 history with a second, fresh node.
 *
 * Run with: npm run demo
 */
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  BSO_INTENT_ADDRESS,
  encodeIntentCalldata,
  isValidBitsocialPublicKey,
  type BsoIntent,
} from "@bitsocial/bso-network-protocol";
import { DerivationNode, FileStateStore, MemoryStateStore, startReadApi } from "@bitsocial/bso-network-node";
import { BsoNetworkResolver } from "@bitsocial/bso-network-resolver";
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import { startDevChain } from "./dev-chain.js";

// Hardhat's first two well-known dev accounts.
const alice = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);
const bob = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
);

// IPNS-style Bitsocial public keys (same shape the BSO Resolver parses from
// the `bitsocial` ENS TXT record today).
const ALICE_PUBLIC_KEY = "12D3KooWN5rLmRJ8fWMwTtkDN7w2RgPPGRM4mtWTnfbjpi1Sh7zR";
const BOB_PUBLIC_KEY = "12D3KooWN5rLmRJ8fWMwTtkDN7w2RgPPGRM4mtWTnfbjpi1Sh7zA";

const step = (() => {
  let count = 0;
  return (title: string) => {
    count += 1;
    console.log(`\n■ Step ${count}: ${title}`);
  };
})();

const ok = (message: string) => console.log(`  ✓ ${message}`);

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Demo assertion failed: ${message}`);
  }
}

async function main(): Promise<void> {
  assert(isValidBitsocialPublicKey(ALICE_PUBLIC_KEY), "alice fixture key is valid");
  assert(isValidBitsocialPublicKey(BOB_PUBLIC_KEY), "bob fixture key is valid");

  console.log("Bitsocial Network POC demo — decentralized .bso names derived from Ethereum L1");
  console.log(`Intent inbox address: ${BSO_INTENT_ADDRESS}`);

  step("Start a local Ethereum L1 dev chain (Hardhat node)");
  const chain = await startDevChain();
  ok(`L1 JSON-RPC at ${chain.rpcUrl}`);

  const publicClient = createPublicClient({
    chain: hardhat,
    transport: http(chain.rpcUrl),
    pollingInterval: 100,
  });
  const wallets = {
    alice: createWalletClient({ account: alice, chain: hardhat, transport: http(chain.rpcUrl) }),
    bob: createWalletClient({ account: bob, chain: hardhat, transport: http(chain.rpcUrl) }),
  };

  step("Start the derivation node and its read API");
  const stateFile = fileURLToPath(new URL("../../.bso-network-data/demo-state.json", import.meta.url));
  rmSync(stateFile, { force: true });
  const node = new DerivationNode({
    rpcUrl: chain.rpcUrl,
    store: new FileStateStore(stateFile),
    logger: {
      info: (message) => console.log(`    [node] ${message}`),
      warn: (message) => console.log(`    [node] ${message}`),
    },
  });
  await node.init();
  node.start();
  const api = await startReadApi(node, { port: 0 });
  ok(`derivation node following L1, read API at ${api.endpoint}`);
  ok(`derived state persisted to ${stateFile}`);

  const resolver = new BsoNetworkResolver({ endpoint: api.endpoint });

  const sendIntent = async (who: "alice" | "bob", intent: BsoIntent): Promise<void> => {
    const hash = await wallets[who].sendTransaction({
      to: BSO_INTENT_ADDRESS as Hex,
      data: encodeIntentCalldata(intent),
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    await node.waitForBlock(Number(receipt.blockNumber));
    console.log(
      `  → ${who} sent "${intent.op} ${intent.name}" in L1 block ${receipt.blockNumber} (tx ${hash.slice(0, 18)}…)`,
    );
  };

  const lastRejection = () => {
    const rejected = node.getRegistry().rejected;
    return rejected[rejected.length - 1];
  };

  step("alice registers alice.bso");
  await sendIntent("alice", {
    op: "register",
    name: "alice.bso",
    publicKey: ALICE_PUBLIC_KEY,
    metadataUri: "ipfs://bafybeigdemoprofilecid/alice.json",
  });

  step("Resolve alice.bso through the resolver SDK");
  assert(resolver.canResolve({ name: "alice.bso" }), "resolver can handle alice.bso");
  assert(!resolver.canResolve({ name: "alice.eth" }), "resolver ignores non-.bso names");
  let record = await resolver.resolve({ name: "alice.bso" });
  assert(record !== undefined, "alice.bso resolves");
  assert(record.owner === alice.address.toLowerCase(), "owner is alice");
  assert(record.publicKey === ALICE_PUBLIC_KEY, "public key matches");
  assert(record.version === 1, "freshly registered name is version 1");
  console.log(`  ${JSON.stringify(record, null, 2).split("\n").join("\n  ")}`);

  step("bob tries to register alice.bso — first valid registration wins");
  await sendIntent("bob", { op: "register", name: "alice.bso", publicKey: BOB_PUBLIC_KEY });
  assert(lastRejection()?.reason === "NAME_TAKEN", "duplicate registration rejected");
  record = await resolver.resolve({ name: "alice.bso" });
  assert(record !== undefined && record.owner === alice.address.toLowerCase(), "alice keeps the name");
  ok(`rejected deterministically with reason ${lastRejection()?.reason}; alice is still the owner`);

  step("bob tries to update alice.bso — only the owner can mutate");
  await sendIntent("bob", { op: "update", name: "alice.bso", publicKey: BOB_PUBLIC_KEY });
  assert(lastRejection()?.reason === "NOT_OWNER", "unauthorized update rejected");
  ok(`rejected deterministically with reason ${lastRejection()?.reason}`);

  step("alice updates her metadata URI");
  await sendIntent("alice", {
    op: "update",
    name: "alice.bso",
    metadataUri: "ipfs://bafybeigdemoprofilecid/alice-v2.json",
  });
  record = await resolver.resolve({ name: "alice.bso" });
  assert(record !== undefined && record.version === 2, "update bumped version to 2");
  ok(`alice.bso is now version ${record.version} with metadataUri ${record.metadataUri}`);

  step("alice transfers alice.bso to bob");
  await sendIntent("alice", { op: "transfer", name: "alice.bso", to: bob.address });
  record = await resolver.resolve({ name: "alice.bso" });
  assert(record !== undefined && record.owner === bob.address.toLowerCase(), "bob now owns the name");
  assert(record.version === 3, "transfer bumped version to 3");
  ok(`alice.bso owner is now ${record.owner} (version ${record.version})`);

  step("bob registers bob.bso");
  await sendIntent("bob", { op: "register", name: "bob.bso", publicKey: BOB_PUBLIC_KEY });
  const bobRecord = await resolver.resolve({ name: "BOB.bso" });
  assert(bobRecord !== undefined && bobRecord.name === "bob.bso", "lookup is case-normalized");
  ok("bob.bso registered (and resolved via the non-canonical spelling 'BOB.bso')");

  step("bob revokes alice.bso — the name is tombstoned");
  await sendIntent("bob", { op: "revoke", name: "alice.bso" });
  record = await resolver.resolve({ name: "alice.bso" });
  assert(record === undefined, "revoked name no longer resolves");
  const raw = await fetch(`${api.endpoint}/v1/names/alice.bso`);
  assert(raw.status === 410, "read API returns 410 Gone for tombstoned names");
  ok(`resolver returns undefined; read API answers HTTP ${raw.status} (tombstoned, permanently unavailable)`);

  step("Determinism check: a second fresh node re-derives the same state from L1");
  const status = node.getStatus();
  const nodeB = new DerivationNode({ rpcUrl: chain.rpcUrl, store: new MemoryStateStore() });
  await nodeB.init();
  await nodeB.syncOnce();
  const hashA = node.stateHash();
  const hashB = nodeB.stateHash();
  console.log(`  node A state hash: ${hashA}`);
  console.log(`  node B state hash: ${hashB}`);
  assert(hashA === hashB, "independent derivations agree");
  ok("independent derivation runs produced byte-identical registry state");

  console.log(`\nFinal registry after L1 block ${status.lastProcessedBlock?.number}:`);
  console.log(`  names: ${status.names} (1 active, 1 tombstoned)`);
  console.log(`  accepted intents: ${status.acceptedIntents}, rejected intents: ${status.rejectedIntents}`);
  console.log("\nAll steps passed. State was derived purely from Ethereum L1 history —");
  console.log("no sequencer, no admin keys, no contract. Anyone can run this node.");

  node.stop();
  nodeB.stop();
  await api.close();
  await resolver.destroy();
  await chain.stop();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
