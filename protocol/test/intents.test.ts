import { stringToHex } from "viem";
import { describe, expect, it } from "vitest";
import {
  decodeIntentCalldata,
  encodeIntentCalldata,
  INTENT_DATA_URI_PREFIX,
  type BsoIntent,
} from "@bitsocial/bso-network-protocol";

const PUBLIC_KEY = "12D3KooWN5rLmRJ8fWMwTtkDN7w2RgPPGRM4mtWTnfbjpi1Sh7zR";

function calldataFor(payload: unknown): `0x${string}` {
  return stringToHex(`${INTENT_DATA_URI_PREFIX}${JSON.stringify(payload)}`);
}

describe("encodeIntentCalldata / decodeIntentCalldata", () => {
  it("round-trips every operation", () => {
    const intents: BsoIntent[] = [
      { op: "register", name: "alice.bso", publicKey: PUBLIC_KEY, metadataUri: "ipfs://meta" },
      { op: "register", name: "alice.bso", publicKey: PUBLIC_KEY },
      { op: "update", name: "alice.bso", publicKey: PUBLIC_KEY },
      { op: "update", name: "alice.bso", metadataUri: null },
      { op: "transfer", name: "alice.bso", to: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8" },
      { op: "revoke", name: "alice.bso" },
    ];
    for (const intent of intents) {
      expect(decodeIntentCalldata(encodeIntentCalldata(intent))).toEqual({
        kind: "intent",
        intent,
      });
    }
  });

  it("skips calldata that does not carry the intent prefix", () => {
    expect(decodeIntentCalldata("0x")).toEqual({ kind: "skip" });
    expect(decodeIntentCalldata("0xdeadbeef")).toEqual({ kind: "skip" });
    expect(decodeIntentCalldata(stringToHex("data:text/plain,hello"))).toEqual({ kind: "skip" });
  });

  it("rejects malformed JSON and non-object payloads", () => {
    expect(decodeIntentCalldata(stringToHex(`${INTENT_DATA_URI_PREFIX}{nope`))).toMatchObject({
      kind: "invalid",
      reason: "INVALID_JSON",
    });
    expect(decodeIntentCalldata(calldataFor([1, 2, 3]))).toMatchObject({
      kind: "invalid",
      reason: "NOT_AN_OBJECT",
    });
    expect(decodeIntentCalldata(calldataFor(null))).toMatchObject({
      kind: "invalid",
      reason: "NOT_AN_OBJECT",
    });
  });

  it("rejects invalid UTF-8 after the prefix", () => {
    const prefixHex = stringToHex(INTENT_DATA_URI_PREFIX);
    expect(decodeIntentCalldata(`${prefixHex}ff`)).toMatchObject({
      kind: "invalid",
      reason: "INVALID_UTF8",
    });
  });

  it("rejects wrong protocol, version, and op", () => {
    const base = { v: 1, op: "register", name: "alice.bso", publicKey: PUBLIC_KEY };
    expect(decodeIntentCalldata(calldataFor({ ...base, p: "other" }))).toMatchObject({
      kind: "invalid",
      reason: "UNSUPPORTED_PROTOCOL",
    });
    expect(decodeIntentCalldata(calldataFor({ ...base, p: "bso-network", v: 2 }))).toMatchObject({
      kind: "invalid",
      reason: "UNSUPPORTED_VERSION",
    });
    expect(
      decodeIntentCalldata(calldataFor({ p: "bso-network", v: 1, op: "destroy", name: "a.bso" })),
    ).toMatchObject({ kind: "invalid", reason: "UNSUPPORTED_OP" });
  });

  it("rejects unknown fields", () => {
    expect(
      decodeIntentCalldata(
        calldataFor({
          p: "bso-network",
          v: 1,
          op: "revoke",
          name: "alice.bso",
          extra: true,
        }),
      ),
    ).toMatchObject({ kind: "invalid", reason: "UNKNOWN_FIELD" });
  });

  it("normalizes names while decoding and surfaces name rejections", () => {
    expect(
      decodeIntentCalldata(
        calldataFor({ p: "bso-network", v: 1, op: "revoke", name: "ALICE.bso" }),
      ),
    ).toEqual({ kind: "intent", intent: { op: "revoke", name: "alice.bso" } });

    expect(
      decodeIntentCalldata(
        calldataFor({ p: "bso-network", v: 1, op: "revoke", name: "sub.alice.bso" }),
      ),
    ).toMatchObject({ kind: "invalid", reason: "NAME_NESTED_LABELS" });
  });

  it("validates register fields", () => {
    expect(
      decodeIntentCalldata(calldataFor({ p: "bso-network", v: 1, op: "register", name: "a.bso" })),
    ).toMatchObject({ kind: "invalid", reason: "INVALID_PUBLIC_KEY" });

    expect(
      decodeIntentCalldata(
        calldataFor({
          p: "bso-network",
          v: 1,
          op: "register",
          name: "a.bso",
          publicKey: "not-a-key",
        }),
      ),
    ).toMatchObject({ kind: "invalid", reason: "INVALID_PUBLIC_KEY" });

    expect(
      decodeIntentCalldata(
        calldataFor({
          p: "bso-network",
          v: 1,
          op: "register",
          name: "a.bso",
          publicKey: PUBLIC_KEY,
          metadataUri: "",
        }),
      ),
    ).toMatchObject({ kind: "invalid", reason: "INVALID_METADATA_URI" });

    expect(
      decodeIntentCalldata(
        calldataFor({
          p: "bso-network",
          v: 1,
          op: "register",
          name: "a.bso",
          publicKey: PUBLIC_KEY,
          metadataUri: "x".repeat(513),
        }),
      ),
    ).toMatchObject({ kind: "invalid", reason: "INVALID_METADATA_URI" });
  });

  it("rejects updates that change nothing", () => {
    expect(
      decodeIntentCalldata(calldataFor({ p: "bso-network", v: 1, op: "update", name: "a.bso" })),
    ).toMatchObject({ kind: "invalid", reason: "EMPTY_UPDATE" });
  });

  it("validates transfer recipients and lowercases them", () => {
    const base = { p: "bso-network", v: 1, op: "transfer", name: "a.bso" };
    expect(decodeIntentCalldata(calldataFor({ ...base, to: "0x1234" }))).toMatchObject({
      kind: "invalid",
      reason: "INVALID_RECIPIENT",
    });
    expect(
      decodeIntentCalldata(
        calldataFor({ ...base, to: "0x0000000000000000000000000000000000000000" }),
      ),
    ).toMatchObject({ kind: "invalid", reason: "INVALID_RECIPIENT" });
    expect(
      decodeIntentCalldata(
        calldataFor({ ...base, to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" }),
      ),
    ).toEqual({
      kind: "intent",
      intent: { op: "transfer", name: "a.bso", to: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8" },
    });
  });
});
