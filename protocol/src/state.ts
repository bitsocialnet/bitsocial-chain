import { sha256, stringToHex } from "viem";
import type { BsoIntent, IntentDecodeResult, IntentOp, StructuralRejectionReason } from "./intents.js";
import { normalizeBsoName } from "./names.js";

export type StatefulRejectionReason =
  | "NAME_TAKEN"
  | "NAME_NOT_REGISTERED"
  | "NAME_REVOKED"
  | "NOT_OWNER";

export type IntentRejectionReason = StructuralRejectionReason | StatefulRejectionReason;

/** L1 position of the transaction an intent was carried in. */
export interface DerivedBlockRef {
  blockNumber: number;
  txIndex: number;
  txHash: string;
  /** L1 block timestamp, seconds. */
  timestamp: number;
}

/** Full L1 context of a transaction being applied to the registry. */
export interface DerivedTxContext extends DerivedBlockRef {
  /** Transaction sender, lowercase 0x address. The authenticated actor. */
  from: string;
}

export interface BsoNameRecord {
  /** Normalized name, e.g. "alice.bso". */
  name: string;
  /** Current owner, lowercase 0x address. */
  owner: string;
  /** Bitsocial public key or community address the name resolves to. */
  publicKey: string;
  metadataUri?: string;
  /** 1 on registration, incremented by every accepted mutation. */
  version: number;
  status: "active" | "revoked";
  createdAt: DerivedBlockRef;
  updatedAt: DerivedBlockRef;
}

export interface RejectedIntentEntry {
  reason: IntentRejectionReason;
  op?: IntentOp;
  /** Normalized name when the intent got far enough to have one. */
  name?: string;
  from: string;
  blockNumber: number;
  txIndex: number;
  txHash: string;
}

export interface RegistryState {
  schemaVersion: 1;
  /** Keyed by normalized name. */
  names: Record<string, BsoNameRecord>;
  /** Every invalid intent attempt, in L1 order — part of derived state. */
  rejected: RejectedIntentEntry[];
  acceptedIntents: number;
}

export type ApplyResult =
  | { outcome: "accepted"; record: BsoNameRecord }
  | { outcome: "rejected"; reason: IntentRejectionReason }
  | { outcome: "skipped" };

export function createGenesisState(): RegistryState {
  return { schemaVersion: 1, names: {}, rejected: [], acceptedIntents: 0 };
}

function blockRef(ctx: DerivedTxContext): DerivedBlockRef {
  return {
    blockNumber: ctx.blockNumber,
    txIndex: ctx.txIndex,
    txHash: ctx.txHash,
    timestamp: ctx.timestamp,
  };
}

function reject(
  state: RegistryState,
  ctx: DerivedTxContext,
  reason: IntentRejectionReason,
  op?: IntentOp,
  name?: string,
): ApplyResult {
  const entry: RejectedIntentEntry = {
    reason,
    from: ctx.from,
    blockNumber: ctx.blockNumber,
    txIndex: ctx.txIndex,
    txHash: ctx.txHash,
  };
  if (op !== undefined) {
    entry.op = op;
  }
  if (name !== undefined) {
    entry.name = name;
  }
  state.rejected.push(entry);
  return { outcome: "rejected", reason };
}

function applyIntent(state: RegistryState, intent: BsoIntent, ctx: DerivedTxContext): ApplyResult {
  const existing = state.names[intent.name];

  if (intent.op === "register") {
    if (existing !== undefined) {
      // First valid registration wins; tombstoned names are permanently
      // unavailable in this POC (explicit deterministic rule, see SPEC.md).
      const reason = existing.status === "revoked" ? "NAME_REVOKED" : "NAME_TAKEN";
      return reject(state, ctx, reason, intent.op, intent.name);
    }
    const record: BsoNameRecord = {
      name: intent.name,
      owner: ctx.from,
      publicKey: intent.publicKey,
      version: 1,
      status: "active",
      createdAt: blockRef(ctx),
      updatedAt: blockRef(ctx),
    };
    if (intent.metadataUri !== undefined) {
      record.metadataUri = intent.metadataUri;
    }
    state.names[intent.name] = record;
    state.acceptedIntents += 1;
    return { outcome: "accepted", record };
  }

  // update / transfer / revoke all require an existing, active, owned name.
  if (existing === undefined) {
    return reject(state, ctx, "NAME_NOT_REGISTERED", intent.op, intent.name);
  }
  if (existing.status === "revoked") {
    return reject(state, ctx, "NAME_REVOKED", intent.op, intent.name);
  }
  if (existing.owner !== ctx.from) {
    return reject(state, ctx, "NOT_OWNER", intent.op, intent.name);
  }

  switch (intent.op) {
    case "update": {
      if (intent.publicKey !== undefined) {
        existing.publicKey = intent.publicKey;
      }
      if (intent.metadataUri !== undefined) {
        if (intent.metadataUri === null) {
          delete existing.metadataUri;
        } else {
          existing.metadataUri = intent.metadataUri;
        }
      }
      break;
    }
    case "transfer": {
      existing.owner = intent.to;
      break;
    }
    case "revoke": {
      existing.status = "revoked";
      break;
    }
  }

  existing.version += 1;
  existing.updatedAt = blockRef(ctx);
  state.acceptedIntents += 1;
  return { outcome: "accepted", record: existing };
}

/**
 * Apply one decoded intent transaction to the registry state, in place.
 *
 * Determinism contract: given the same prior state and the same
 * (decoded, ctx) sequence — which is fully determined by L1 history — this
 * function always produces the same next state. It performs no IO, reads no
 * clocks, and iterates nothing with nondeterministic order.
 */
export function applyDecodedIntent(
  state: RegistryState,
  decoded: IntentDecodeResult,
  ctx: DerivedTxContext,
): ApplyResult {
  switch (decoded.kind) {
    case "skip":
      return { outcome: "skipped" };
    case "invalid":
      return reject(state, ctx, decoded.reason, decoded.op, decoded.name);
    case "intent":
      return applyIntent(state, decoded.intent, ctx);
  }
}

export type ResolveOutcome =
  | { status: "active"; record: BsoNameRecord }
  | { status: "revoked"; record: BsoNameRecord }
  | { status: "unregistered"; name: string }
  | { status: "invalid_name" };

/** Resolve a (possibly non-normalized) name against derived state. */
export function resolveName(state: RegistryState, rawName: string): ResolveOutcome {
  const normalized = normalizeBsoName(rawName);
  if (!normalized.ok) {
    return { status: "invalid_name" };
  }
  const record = state.names[normalized.name];
  if (record === undefined) {
    return { status: "unregistered", name: normalized.name };
  }
  return record.status === "active"
    ? { status: "active", record }
    : { status: "revoked", record };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/** JSON serialization with recursively sorted object keys. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

/**
 * Commitment to the full derived state: sha256 over the canonical JSON
 * serialization. Two derivation runs over the same L1 history must produce
 * the same hash. (A production appchain would use a real state root; see
 * POC_LIMITATIONS.md.)
 */
export function computeStateHash(state: RegistryState): string {
  return sha256(stringToHex(canonicalJson(state)));
}
