const BASE58_PATTERN = /^[1-9A-HJ-NP-Za-km-z]+$/;

/**
 * Validate a Bitsocial public key / community address.
 *
 * Bitsocial identities and communities are addressed by IPNS-style base58
 * keys today (see the `bitsocial` ENS TXT record parsed by
 * `@bitsocial/bso-resolver`). This POC accepts the same two shapes:
 *
 * - ed25519 libp2p peer IDs: base58, starting with "12D3Koo", 52 characters
 * - legacy CIDv0-style keys: base58, starting with "Qm", 46 characters
 *
 * Unlike the read-side resolver, the registry does NOT trim input — the
 * stored value must already be canonical, so validation is strict.
 */
export function isValidBitsocialPublicKey(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }
  if (!BASE58_PATTERN.test(value)) {
    return false;
  }
  if (value.startsWith("12D3Koo")) {
    return value.length === 52;
  }
  if (value.startsWith("Qm")) {
    return value.length === 46;
  }
  return false;
}
