import { describe, expect, it } from "vitest";
import { isValidBsoName, normalizeBsoName } from "@bitsocial/bso-chain-protocol";

describe("normalizeBsoName", () => {
  it("accepts simple lowercase names", () => {
    expect(normalizeBsoName("alice.bso")).toEqual({ ok: true, name: "alice.bso" });
    expect(normalizeBsoName("a.bso")).toEqual({ ok: true, name: "a.bso" });
    expect(normalizeBsoName("a1-b2.bso")).toEqual({ ok: true, name: "a1-b2.bso" });
    expect(normalizeBsoName("123.bso")).toEqual({ ok: true, name: "123.bso" });
  });

  it("lowercases ASCII uppercase as part of normalization", () => {
    expect(normalizeBsoName("Alice.bso")).toEqual({ ok: true, name: "alice.bso" });
    expect(normalizeBsoName("ALICE.BSO")).toEqual({ ok: true, name: "alice.bso" });
  });

  it("accepts labels at the maximum length and rejects beyond it", () => {
    const max = "a".repeat(63);
    expect(normalizeBsoName(`${max}.bso`)).toEqual({ ok: true, name: `${max}.bso` });
    expect(normalizeBsoName(`${"a".repeat(64)}.bso`)).toEqual({
      ok: false,
      reason: "NAME_TOO_LONG",
    });
  });

  it("rejects non-strings", () => {
    expect(normalizeBsoName(42)).toEqual({ ok: false, reason: "NAME_NOT_STRING" });
    expect(normalizeBsoName(undefined)).toEqual({ ok: false, reason: "NAME_NOT_STRING" });
    expect(normalizeBsoName(null)).toEqual({ ok: false, reason: "NAME_NOT_STRING" });
  });

  it("rejects names without the .bso TLD", () => {
    expect(normalizeBsoName("alice")).toEqual({ ok: false, reason: "NAME_MISSING_TLD" });
    expect(normalizeBsoName("alice.eth")).toEqual({ ok: false, reason: "NAME_MISSING_TLD" });
    expect(normalizeBsoName("")).toEqual({ ok: false, reason: "NAME_MISSING_TLD" });
  });

  it("rejects empty labels", () => {
    expect(normalizeBsoName(".bso")).toEqual({ ok: false, reason: "NAME_EMPTY_LABEL" });
  });

  it("rejects subdomains and consecutive dots", () => {
    expect(normalizeBsoName("sub.alice.bso")).toEqual({ ok: false, reason: "NAME_NESTED_LABELS" });
    expect(normalizeBsoName("alice..bso")).toEqual({ ok: false, reason: "NAME_NESTED_LABELS" });
  });

  it("rejects characters outside a-z, 0-9 and hyphen", () => {
    expect(normalizeBsoName("al ice.bso")).toEqual({ ok: false, reason: "NAME_INVALID_CHARACTER" });
    expect(normalizeBsoName("al_ice.bso")).toEqual({ ok: false, reason: "NAME_INVALID_CHARACTER" });
    expect(normalizeBsoName("alicé.bso")).toEqual({ ok: false, reason: "NAME_INVALID_CHARACTER" });
    expect(normalizeBsoName("ali🐸ce.bso")).toEqual({ ok: false, reason: "NAME_INVALID_CHARACTER" });
  });

  it("does not let Unicode lowercase mappings alias into ASCII", () => {
    // U+212A KELVIN SIGN lowercases to ASCII "k" via toLowerCase(); the
    // protocol must treat it as an invalid character instead.
    expect(normalizeBsoName("K.bso")).toEqual({
      ok: false,
      reason: "NAME_INVALID_CHARACTER",
    });
  });

  it("rejects leading or trailing hyphens", () => {
    expect(normalizeBsoName("-alice.bso")).toEqual({ ok: false, reason: "NAME_HYPHEN_EDGE" });
    expect(normalizeBsoName("alice-.bso")).toEqual({ ok: false, reason: "NAME_HYPHEN_EDGE" });
  });
});

describe("isValidBsoName", () => {
  it("matches normalizeBsoName outcomes", () => {
    expect(isValidBsoName("alice.bso")).toBe(true);
    expect(isValidBsoName("alice.eth")).toBe(false);
    expect(isValidBsoName(123)).toBe(false);
  });
});
