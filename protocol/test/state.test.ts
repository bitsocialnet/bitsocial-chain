import { describe, expect, it } from "vitest";
import {
  applyDecodedIntent,
  canonicalJson,
  computeStateHash,
  createGenesisState,
  decodeIntentCalldata,
  encodeIntentCalldata,
  resolveName,
  type BsoIntent,
  type DerivedTxContext,
  type RegistryState,
} from "@bitsocial/bso-network-protocol";

const KEY_A = "12D3KooWN5rLmRJ8fWMwTtkDN7w2RgPPGRM4mtWTnfbjpi1Sh7zR";
const KEY_B = "12D3KooWN5rLmRJ8fWMwTtkDN7w2RgPPGRM4mtWTnfbjpi1Sh7zA";
const ALICE = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";
const BOB = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8";

let txCounter = 0;
function ctx(from: string, blockNumber: number, txIndex = 0): DerivedTxContext {
  txCounter += 1;
  return {
    from,
    blockNumber,
    txIndex,
    txHash: `0x${txCounter.toString(16).padStart(64, "0")}`,
    timestamp: 1_700_000_000 + blockNumber * 12,
  };
}

function apply(state: RegistryState, intent: BsoIntent, context: DerivedTxContext) {
  // Go through the real calldata codec so state tests exercise the same
  // path the derivation node uses.
  return applyDecodedIntent(state, decodeIntentCalldata(encodeIntentCalldata(intent)), context);
}

describe("registry state transitions", () => {
  it("registers a valid name", () => {
    const state = createGenesisState();
    const result = apply(
      state,
      { op: "register", name: "alice.bso", publicKey: KEY_A, metadataUri: "ipfs://m1" },
      ctx(ALICE, 10, 2),
    );

    expect(result.outcome).toBe("accepted");
    const record = state.names["alice.bso"];
    expect(record).toMatchObject({
      name: "alice.bso",
      owner: ALICE,
      publicKey: KEY_A,
      metadataUri: "ipfs://m1",
      version: 1,
      status: "active",
    });
    expect(record?.createdAt).toMatchObject({ blockNumber: 10, txIndex: 2 });
    expect(record?.createdAt).toEqual(record?.updatedAt);
    expect(state.acceptedIntents).toBe(1);
    expect(state.rejected).toHaveLength(0);
  });

  it("first valid registration wins; duplicates are rejected", () => {
    const state = createGenesisState();
    apply(state, { op: "register", name: "alice.bso", publicKey: KEY_A }, ctx(ALICE, 10));
    const result = apply(state, { op: "register", name: "alice.bso", publicKey: KEY_B }, ctx(BOB, 11));

    expect(result).toEqual({ outcome: "rejected", reason: "NAME_TAKEN" });
    expect(state.names["alice.bso"]?.owner).toBe(ALICE);
    expect(state.rejected).toHaveLength(1);
    expect(state.rejected[0]).toMatchObject({
      reason: "NAME_TAKEN",
      op: "register",
      name: "alice.bso",
      from: BOB,
      blockNumber: 11,
    });
  });

  it("rejects mutations from non-owners", () => {
    const state = createGenesisState();
    apply(state, { op: "register", name: "alice.bso", publicKey: KEY_A }, ctx(ALICE, 10));

    for (const intent of [
      { op: "update", name: "alice.bso", publicKey: KEY_B },
      { op: "transfer", name: "alice.bso", to: BOB },
      { op: "revoke", name: "alice.bso" },
    ] satisfies BsoIntent[]) {
      const result = apply(state, intent, ctx(BOB, 11));
      expect(result).toEqual({ outcome: "rejected", reason: "NOT_OWNER" });
    }
    expect(state.names["alice.bso"]).toMatchObject({ owner: ALICE, version: 1, status: "active" });
  });

  it("applies authorized updates and clears metadata with null", () => {
    const state = createGenesisState();
    apply(
      state,
      { op: "register", name: "alice.bso", publicKey: KEY_A, metadataUri: "ipfs://m1" },
      ctx(ALICE, 10),
    );

    apply(state, { op: "update", name: "alice.bso", publicKey: KEY_B }, ctx(ALICE, 11));
    expect(state.names["alice.bso"]).toMatchObject({
      publicKey: KEY_B,
      metadataUri: "ipfs://m1",
      version: 2,
    });

    apply(state, { op: "update", name: "alice.bso", metadataUri: null }, ctx(ALICE, 12));
    const record = state.names["alice.bso"];
    expect(record?.version).toBe(3);
    expect(record?.metadataUri).toBeUndefined();
    expect(record?.createdAt.blockNumber).toBe(10);
    expect(record?.updatedAt.blockNumber).toBe(12);
  });

  it("transfers ownership", () => {
    const state = createGenesisState();
    apply(state, { op: "register", name: "alice.bso", publicKey: KEY_A }, ctx(ALICE, 10));
    apply(state, { op: "transfer", name: "alice.bso", to: BOB }, ctx(ALICE, 11));

    expect(state.names["alice.bso"]).toMatchObject({ owner: BOB, version: 2 });

    // Old owner lost control; new owner has it.
    expect(apply(state, { op: "update", name: "alice.bso", publicKey: KEY_B }, ctx(ALICE, 12))).toEqual(
      { outcome: "rejected", reason: "NOT_OWNER" },
    );
    expect(
      apply(state, { op: "update", name: "alice.bso", publicKey: KEY_B }, ctx(BOB, 13)).outcome,
    ).toBe("accepted");
  });

  it("revokes a name into a permanent tombstone", () => {
    const state = createGenesisState();
    apply(state, { op: "register", name: "alice.bso", publicKey: KEY_A }, ctx(ALICE, 10));
    apply(state, { op: "revoke", name: "alice.bso" }, ctx(ALICE, 11));

    expect(state.names["alice.bso"]).toMatchObject({ status: "revoked", version: 2 });
    expect(resolveName(state, "alice.bso").status).toBe("revoked");

    // Nothing can touch a tombstoned name, including its last owner and
    // would-be re-registrants.
    for (const [intent, from] of [
      [{ op: "register", name: "alice.bso", publicKey: KEY_B }, BOB],
      [{ op: "update", name: "alice.bso", publicKey: KEY_B }, ALICE],
      [{ op: "transfer", name: "alice.bso", to: BOB }, ALICE],
      [{ op: "revoke", name: "alice.bso" }, ALICE],
    ] satisfies Array<[BsoIntent, string]>) {
      expect(apply(state, intent, ctx(from, 12))).toEqual({
        outcome: "rejected",
        reason: "NAME_REVOKED",
      });
    }
  });

  it("rejects mutations of unregistered names", () => {
    const state = createGenesisState();
    expect(apply(state, { op: "revoke", name: "ghost.bso" }, ctx(ALICE, 10))).toEqual({
      outcome: "rejected",
      reason: "NAME_NOT_REGISTERED",
    });
  });

  it("records structurally invalid intents as rejected", () => {
    const state = createGenesisState();
    const decoded = decodeIntentCalldata(
      // Valid prefix, garbage payload.
      `${encodeIntentCalldata({ op: "revoke", name: "a.bso" }).slice(0, 80)}ff`,
    );
    const result = applyDecodedIntent(state, decoded, ctx(ALICE, 10));
    expect(result.outcome).toBe("rejected");
    expect(state.rejected).toHaveLength(1);
  });

  it("ignores non-intent calldata without recording anything", () => {
    const state = createGenesisState();
    const before = computeStateHash(state);
    const result = applyDecodedIntent(state, decodeIntentCalldata("0xdeadbeef"), ctx(ALICE, 10));
    expect(result).toEqual({ outcome: "skipped" });
    expect(computeStateHash(state)).toBe(before);
  });

  it("resolves names case-insensitively and flags invalid names", () => {
    const state = createGenesisState();
    apply(state, { op: "register", name: "alice.bso", publicKey: KEY_A }, ctx(ALICE, 10));
    expect(resolveName(state, "ALICE.bso")).toMatchObject({ status: "active" });
    expect(resolveName(state, "missing.bso")).toEqual({
      status: "unregistered",
      name: "missing.bso",
    });
    expect(resolveName(state, "not a name")).toEqual({ status: "invalid_name" });
  });
});

describe("determinism", () => {
  const script: Array<{ intent: BsoIntent; from: string }> = [
    { intent: { op: "register", name: "alice.bso", publicKey: KEY_A }, from: ALICE },
    { intent: { op: "register", name: "alice.bso", publicKey: KEY_B }, from: BOB },
    { intent: { op: "update", name: "alice.bso", metadataUri: "ipfs://m2" }, from: ALICE },
    { intent: { op: "transfer", name: "alice.bso", to: BOB }, from: ALICE },
    { intent: { op: "register", name: "bob.bso", publicKey: KEY_B }, from: BOB },
    { intent: { op: "revoke", name: "alice.bso" }, from: BOB },
  ];

  function derive(): RegistryState {
    const state = createGenesisState();
    script.forEach((entry, index) => {
      const context: DerivedTxContext = {
        from: entry.from,
        blockNumber: 100 + index,
        txIndex: 0,
        txHash: `0x${(index + 1).toString(16).padStart(64, "0")}`,
        timestamp: 1_700_000_000 + index * 12,
      };
      applyDecodedIntent(state, decodeIntentCalldata(encodeIntentCalldata(entry.intent)), context);
    });
    return state;
  }

  it("replaying the same history yields byte-identical state", () => {
    const first = derive();
    const second = derive();
    expect(computeStateHash(first)).toBe(computeStateHash(second));
    expect(canonicalJson(first)).toBe(canonicalJson(second));
  });

  it("canonicalJson is insensitive to object key insertion order", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
  });

  it("different histories yield different hashes", () => {
    const state = derive();
    const other = derive();
    applyDecodedIntent(
      other,
      decodeIntentCalldata(encodeIntentCalldata({ op: "register", name: "carol.bso", publicKey: KEY_A })),
      { from: ALICE, blockNumber: 200, txIndex: 0, txHash: `0x${"9".repeat(64)}`, timestamp: 1_700_009_999 },
    );
    expect(computeStateHash(state)).not.toBe(computeStateHash(other));
  });
});
