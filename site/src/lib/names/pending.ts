import { type Address, type Hex, isAddress, isHex } from "viem";
import { MAX_COMMITMENT_AGE, REGISTRY } from "./registry";

/**
 * A commitment waiting to be revealed. The secret only exists here, so the page keeps it in
 * localStorage: a reload or a closed tab must not cost the visitor their reservation.
 *
 * `committedAt` is the block time of the commit once `confirmed`. Before that it is when the
 * wallet signed, which can be well before the commit is mined, so it must not time the reveal.
 */
export type PendingClaim = {
  registry: Address;
  label: string;
  owner: Address;
  secret: Hex;
  committedAt: number;
  confirmed: boolean;
  commitTx: Hex;
};

const STORAGE_KEY = "bso-names-pending";

// Set when storage refuses a write: this tab's changes (a claim, or null for a removed one, by
// `keyOf`) then live in its memory, over whatever other tabs store, until a write succeeds.
let unsaved: Map<string, PendingClaim | null> | null = null;

const keyOf = (claim: Pick<PendingClaim, "registry" | "label" | "owner">) =>
  `${claim.registry.toLowerCase()}|${claim.label}|${claim.owner.toLowerCase()}`;

// Storage can hold anything (another version of the page, a hand edit), and a malformed entry
// would throw while the page renders, so only whole claims are read.
function isPendingClaim(value: unknown): value is PendingClaim {
  if (typeof value !== "object" || value === null) return false;
  const claim = value as Record<string, unknown>;
  return (
    typeof claim.registry === "string" &&
    isAddress(claim.registry, { strict: false }) &&
    typeof claim.label === "string" &&
    claim.label !== "" &&
    typeof claim.owner === "string" &&
    isAddress(claim.owner, { strict: false }) &&
    isHex(claim.secret) &&
    claim.secret.length === 66 &&
    typeof claim.committedAt === "number" &&
    Number.isFinite(claim.committedAt) &&
    typeof claim.confirmed === "boolean" &&
    isHex(claim.commitTx) &&
    claim.commitTx.length === 66
  );
}

function readStored(): PendingClaim[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isPendingClaim) : [];
  } catch {
    return [];
  }
}

function readAll(): PendingClaim[] {
  const stored = readStored();
  if (!unsaved) return stored;
  const changes = unsaved;
  return [
    ...stored.filter((claim) => !changes.has(keyOf(claim))),
    ...[...changes.values()].filter((claim) => claim !== null),
  ];
}

// An unconfirmed claim is kept until its commit is found on chain or reverts, or the visitor
// starts over: however late the commit is mined, it still gets its full day to be revealed.
const live = (claim: PendingClaim, now: number) =>
  !claim.confirmed || now < claim.committedAt + MAX_COMMITMENT_AGE;

/** Puts `next` in place of `claim` (null removes it) and drops claims past their reveal window. */
function write(claim: PendingClaim, next: PendingClaim | null) {
  const key = keyOf(claim);
  const now = Date.now() / 1000;
  const claims = readAll().filter((other) => keyOf(other) !== key && live(other, now));
  if (next) claims.push(next);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(claims));
    unsaved = null;
  } catch {
    unsaved = new Map(unsaved).set(key, next);
  }
}

/** False when storage is blocked or full, so a reservation lasts only as long as this tab. */
export function pendingClaimsSaved(): boolean {
  return unsaved === null;
}

export function findPendingClaim(label: string, owner: Address): PendingClaim | null {
  if (!REGISTRY) return null;
  const now = Date.now() / 1000;
  const key = keyOf({ registry: REGISTRY.address, label, owner });
  return readAll().find((claim) => keyOf(claim) === key && live(claim, now)) ?? null;
}

export function savePendingClaim(claim: PendingClaim) {
  write(claim, claim);
}

export function removePendingClaim(claim: PendingClaim) {
  write(claim, null);
}
