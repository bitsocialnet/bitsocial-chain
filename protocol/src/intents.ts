import { hexToBytes, stringToHex } from "viem";
import {
  INTENT_DATA_URI_PREFIX,
  INTENT_SCHEMA_VERSION,
  MAX_METADATA_URI_LENGTH,
  PROTOCOL_ID,
} from "./constants.js";
import { normalizeBsoName, type NameRejectionReason } from "./names.js";
import { isValidBitsocialPublicKey } from "./publicKeys.js";

export type IntentOp = "register" | "update" | "transfer" | "revoke";

export interface RegisterIntent {
  op: "register";
  /** Normalized .bso name. */
  name: string;
  /** Bitsocial public key or community address the name resolves to. */
  publicKey: string;
  metadataUri?: string;
}

export interface UpdateIntent {
  op: "update";
  name: string;
  publicKey?: string;
  /** A string replaces the metadata URI; `null` clears it. */
  metadataUri?: string | null;
}

export interface TransferIntent {
  op: "transfer";
  name: string;
  /** New owner, lowercase 0x address. */
  to: string;
}

export interface RevokeIntent {
  op: "revoke";
  name: string;
}

export type BsoIntent = RegisterIntent | UpdateIntent | TransferIntent | RevokeIntent;

export type StructuralRejectionReason =
  | "INVALID_UTF8"
  | "INVALID_JSON"
  | "NOT_AN_OBJECT"
  | "UNSUPPORTED_PROTOCOL"
  | "UNSUPPORTED_VERSION"
  | "UNSUPPORTED_OP"
  | "UNKNOWN_FIELD"
  | "INVALID_PUBLIC_KEY"
  | "INVALID_METADATA_URI"
  | "EMPTY_UPDATE"
  | "INVALID_RECIPIENT"
  | NameRejectionReason;

export type IntentDecodeResult =
  /** Calldata does not carry the intent prefix: not an intent attempt at all. */
  | { kind: "skip" }
  /** Prefixed intent attempt that fails structural validation. */
  | { kind: "invalid"; reason: StructuralRejectionReason; op?: IntentOp; name?: string }
  /** Structurally valid intent with a normalized name. */
  | { kind: "intent"; intent: BsoIntent };

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const EVM_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

const ALLOWED_FIELDS: Record<IntentOp, ReadonlySet<string>> = {
  register: new Set(["p", "v", "op", "name", "publicKey", "metadataUri"]),
  update: new Set(["p", "v", "op", "name", "publicKey", "metadataUri"]),
  transfer: new Set(["p", "v", "op", "name", "to"]),
  revoke: new Set(["p", "v", "op", "name"]),
};

const INTENT_PREFIX_HEX = stringToHex(INTENT_DATA_URI_PREFIX).toLowerCase();

function isValidMetadataUri(value: unknown): value is string {
  return (
    typeof value === "string" && value.length > 0 && value.length <= MAX_METADATA_URI_LENGTH
  );
}

/**
 * Encode an intent payload as L1 transaction calldata
 * (`data:application/vnd.bso.intent+json,{...}` as UTF-8 hex).
 *
 * Note: the calldata bytes on L1 are the source of truth. Two byte-different
 * encodings of an equivalent intent are simply two intents; derivation never
 * depends on how clients choose to serialize JSON.
 */
export function encodeIntentCalldata(intent: BsoIntent): `0x${string}` {
  const payload: Record<string, unknown> = { p: PROTOCOL_ID, v: INTENT_SCHEMA_VERSION, ...intent };
  return stringToHex(`${INTENT_DATA_URI_PREFIX}${JSON.stringify(payload)}`);
}

/**
 * Decode and structurally validate intent calldata.
 *
 * Stateful rules (ownership, availability, tombstones) are applied later by
 * the state transition function; this step only decides whether the calldata
 * is a well-formed intent.
 */
export function decodeIntentCalldata(calldata: string): IntentDecodeResult {
  const data = calldata.toLowerCase();
  if (!data.startsWith(INTENT_PREFIX_HEX)) {
    return { kind: "skip" };
  }

  let text: string;
  try {
    const body = hexToBytes(`0x${calldata.slice(INTENT_PREFIX_HEX.length)}`);
    text = new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    return { kind: "invalid", reason: "INVALID_UTF8" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { kind: "invalid", reason: "INVALID_JSON" };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { kind: "invalid", reason: "NOT_AN_OBJECT" };
  }
  const payload = parsed as Record<string, unknown>;

  if (payload.p !== PROTOCOL_ID) {
    return { kind: "invalid", reason: "UNSUPPORTED_PROTOCOL" };
  }
  if (payload.v !== INTENT_SCHEMA_VERSION) {
    return { kind: "invalid", reason: "UNSUPPORTED_VERSION" };
  }

  const op = payload.op;
  if (op !== "register" && op !== "update" && op !== "transfer" && op !== "revoke") {
    return { kind: "invalid", reason: "UNSUPPORTED_OP" };
  }

  for (const field of Object.keys(payload)) {
    if (!ALLOWED_FIELDS[op].has(field)) {
      return { kind: "invalid", reason: "UNKNOWN_FIELD", op };
    }
  }

  const normalized = normalizeBsoName(payload.name);
  if (!normalized.ok) {
    return { kind: "invalid", reason: normalized.reason, op };
  }
  const name = normalized.name;

  switch (op) {
    case "register": {
      if (!isValidBitsocialPublicKey(payload.publicKey)) {
        return { kind: "invalid", reason: "INVALID_PUBLIC_KEY", op, name };
      }
      if (payload.metadataUri !== undefined && !isValidMetadataUri(payload.metadataUri)) {
        return { kind: "invalid", reason: "INVALID_METADATA_URI", op, name };
      }
      const intent: RegisterIntent = { op, name, publicKey: payload.publicKey as string };
      if (payload.metadataUri !== undefined) {
        intent.metadataUri = payload.metadataUri as string;
      }
      return { kind: "intent", intent };
    }

    case "update": {
      if (payload.publicKey === undefined && payload.metadataUri === undefined) {
        return { kind: "invalid", reason: "EMPTY_UPDATE", op, name };
      }
      if (payload.publicKey !== undefined && !isValidBitsocialPublicKey(payload.publicKey)) {
        return { kind: "invalid", reason: "INVALID_PUBLIC_KEY", op, name };
      }
      if (
        payload.metadataUri !== undefined &&
        payload.metadataUri !== null &&
        !isValidMetadataUri(payload.metadataUri)
      ) {
        return { kind: "invalid", reason: "INVALID_METADATA_URI", op, name };
      }
      const intent: UpdateIntent = { op, name };
      if (payload.publicKey !== undefined) {
        intent.publicKey = payload.publicKey as string;
      }
      if (payload.metadataUri !== undefined) {
        intent.metadataUri = payload.metadataUri as string | null;
      }
      return { kind: "intent", intent };
    }

    case "transfer": {
      if (
        typeof payload.to !== "string" ||
        !EVM_ADDRESS_PATTERN.test(payload.to) ||
        payload.to.toLowerCase() === ZERO_ADDRESS
      ) {
        return { kind: "invalid", reason: "INVALID_RECIPIENT", op, name };
      }
      return { kind: "intent", intent: { op, name, to: payload.to.toLowerCase() } };
    }

    case "revoke": {
      return { kind: "intent", intent: { op, name } };
    }
  }
}
