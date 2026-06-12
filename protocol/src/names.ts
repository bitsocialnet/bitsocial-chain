import { MAX_LABEL_LENGTH } from "./constants.js";

export type NameRejectionReason =
  | "NAME_NOT_STRING"
  | "NAME_MISSING_TLD"
  | "NAME_NESTED_LABELS"
  | "NAME_EMPTY_LABEL"
  | "NAME_TOO_LONG"
  | "NAME_INVALID_CHARACTER"
  | "NAME_HYPHEN_EDGE";

export type NameNormalizationResult =
  | { ok: true; name: string }
  | { ok: false; reason: NameRejectionReason };

const LABEL_PATTERN = /^[a-z0-9-]+$/;

/**
 * Lowercase ASCII letters only. Unicode-aware `toLowerCase()` is deliberately
 * avoided: it maps some non-ASCII code points into ASCII (e.g. "K" → "k"),
 * which would create surprising aliasing. Anything outside ASCII stays as-is
 * and is then rejected by the character check.
 */
function asciiLowercase(value: string): string {
  let out = "";
  for (const char of value) {
    const code = char.charCodeAt(0);
    out += code >= 0x41 && code <= 0x5a ? String.fromCharCode(code + 0x20) : char;
  }
  return out;
}

/**
 * Normalize a .bso name into its canonical registry form.
 *
 * Rules (deterministic, see SPEC.md):
 * - the name must end in ".bso"
 * - exactly one label (no subdomains in this POC)
 * - labels are lowercase ASCII `a-z`, `0-9`, `-` (uppercase ASCII input is
 *   lowercased as part of normalization)
 * - empty labels are rejected
 * - leading or trailing hyphens are rejected
 * - labels longer than {@link MAX_LABEL_LENGTH} characters are rejected
 */
export function normalizeBsoName(input: unknown): NameNormalizationResult {
  if (typeof input !== "string") {
    return { ok: false, reason: "NAME_NOT_STRING" };
  }

  const lowered = asciiLowercase(input);
  if (!lowered.endsWith(".bso")) {
    return { ok: false, reason: "NAME_MISSING_TLD" };
  }

  const label = lowered.slice(0, -".bso".length);
  if (label.length === 0) {
    return { ok: false, reason: "NAME_EMPTY_LABEL" };
  }
  if (label.includes(".")) {
    return { ok: false, reason: "NAME_NESTED_LABELS" };
  }
  if (label.length > MAX_LABEL_LENGTH) {
    return { ok: false, reason: "NAME_TOO_LONG" };
  }
  if (!LABEL_PATTERN.test(label)) {
    return { ok: false, reason: "NAME_INVALID_CHARACTER" };
  }
  if (label.startsWith("-") || label.endsWith("-")) {
    return { ok: false, reason: "NAME_HYPHEN_EDGE" };
  }

  return { ok: true, name: `${label}.bso` };
}

export function isValidBsoName(input: unknown): boolean {
  return normalizeBsoName(input).ok;
}
