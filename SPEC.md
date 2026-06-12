# .bso Name Registry — POC Protocol Specification

Normative rules for deriving `.bso` registry state from Ethereum L1 history. Every rule in this document is deterministic and reproducible from L1 data alone; the reference implementation lives in [`protocol/`](protocol/), and any independent implementation following this spec must derive byte-identical state.

Status: proof of concept, schema version 1. See [POC_LIMITATIONS.md](POC_LIMITATIONS.md).

## 1. Protocol parameters

| Parameter | Value |
| --- | --- |
| Protocol ID (`p`) | `bso-network` |
| Intent schema version (`v`) | `1` |
| Intent inbox address | `0x0000000000000000000000000000000000b50b50` (compared lowercase) |
| Calldata prefix | `data:application/vnd.bso.intent+json,` (UTF-8, exact match) |
| Max label length | 63 characters |
| Max metadata URI length | 512 characters |
| Genesis | configured `startBlock` (first L1 block scanned, inclusive) |

The inbox address is a vanity address with no known private key and no code, in the spirit of Facet's magic address. Because no code can ever execute there, transactions to it cannot revert; receipt status is therefore irrelevant and intentionally not consulted.

## 2. Intent transport

A transaction is an **intent attempt** if and only if:

1. `tx.to` equals the inbox address (case-insensitive); and
2. `tx.input` (calldata) begins with the UTF-8 bytes of the calldata prefix.

Everything else about the transaction — value, gas, type, nonce — is ignored. Transactions to the inbox whose calldata does **not** begin with the prefix are **skipped** silently (they are not intents). Intent attempts that fail any rule below are **rejected**: recorded in derived state with a deterministic reason code, and otherwise ignored.

The authenticated actor of an intent is `tx.from`, lowercased. L1 signature verification is the only authentication.

The bytes after the prefix MUST decode as UTF-8 (rejection: `INVALID_UTF8`) and parse as a single JSON object (rejections: `INVALID_JSON`, `NOT_AN_OBJECT`).

## 3. Intent payloads

Common required fields:

| Field | Rule | Rejection |
| --- | --- | --- |
| `p` | must equal `bso-network` | `UNSUPPORTED_PROTOCOL` |
| `v` | must equal `1` | `UNSUPPORTED_VERSION` |
| `op` | one of `register`, `update`, `transfer`, `revoke` | `UNSUPPORTED_OP` |
| `name` | normalizes per §4 | name rejection reasons (§4) |

Fields outside the allowed set for the op are rejected with `UNKNOWN_FIELD` (strict schema; future fields require a `v` bump).

### register

```json
{ "p": "bso-network", "v": 1, "op": "register", "name": "alice.bso",
  "publicKey": "12D3Koo…", "metadataUri": "ipfs://…" }
```

- `publicKey` (required): valid per §5, else `INVALID_PUBLIC_KEY`.
- `metadataUri` (optional): non-empty string, ≤ 512 chars, else `INVALID_METADATA_URI`.

### update

```json
{ "p": "bso-network", "v": 1, "op": "update", "name": "alice.bso",
  "publicKey": "12D3Koo…", "metadataUri": "ipfs://…" }
```

- At least one of `publicKey` / `metadataUri` must be present, else `EMPTY_UPDATE`.
- `publicKey`, if present: valid per §5.
- `metadataUri`, if present: a valid string replaces the stored URI; JSON `null` clears it.

### transfer

```json
{ "p": "bso-network", "v": 1, "op": "transfer", "name": "alice.bso", "to": "0x…" }
```

- `to` (required): a 20-byte `0x` hex address, not the zero address, else `INVALID_RECIPIENT`. Stored lowercase.

### revoke

```json
{ "p": "bso-network", "v": 1, "op": "revoke", "name": "alice.bso" }
```

No additional fields.

## 4. Name normalization

A name is valid iff, after normalization, it is `<label>.bso` where:

- normalization lowercases ASCII `A–Z` only (Unicode lowercasing is deliberately not applied, so no non-ASCII code point can alias into a valid name);
- the name ends in `.bso` (`NAME_MISSING_TLD`);
- there is exactly one label — no subdomains in this POC (`NAME_NESTED_LABELS`);
- the label is non-empty (`NAME_EMPTY_LABEL`) and at most 63 characters (`NAME_TOO_LONG`);
- the label contains only `a-z`, `0-9`, `-` (`NAME_INVALID_CHARACTER`);
- the label neither starts nor ends with `-` (`NAME_HYPHEN_EDGE`);
- non-string names reject with `NAME_NOT_STRING`.

The normalized form (lowercase) is the registry key; lookups normalize first, so `ALICE.bso` resolves `alice.bso`.

## 5. Public keys

`publicKey` must be a Bitsocial public key or community address in the same IPNS-style base58 shapes the existing BSO Resolver parses from the `bitsocial` ENS TXT record:

- `12D3Koo…` (ed25519 libp2p peer ID): exactly 52 base58 characters; or
- `Qm…` (legacy CIDv0): exactly 46 base58 characters.

Base58 alphabet: `[1-9A-HJ-NP-Za-km-z]`. No trimming is applied; the value must be canonical as sent.

## 6. State transition rules

Intent attempts are applied strictly in L1 order: ascending block number, then ascending transaction index within a block. Re-running the rules over the same history from the same `startBlock` MUST produce identical state — the state transition performs no IO, reads no clocks, and depends on nothing but (previous state, intent, L1 transaction context).

| Op | Precondition | Effect | Rejection |
| --- | --- | --- | --- |
| `register` | name unregistered | record created: `owner = tx.from`, `version = 1`, `status = active`, `createdAt = updatedAt =` L1 context | `NAME_TAKEN` if active, `NAME_REVOKED` if tombstoned |
| `update` | name active, `tx.from` is owner | replaces `publicKey` and/or `metadataUri` (`null` clears), `version += 1`, `updatedAt` set | `NAME_NOT_REGISTERED`, `NAME_REVOKED`, `NOT_OWNER` |
| `transfer` | name active, `tx.from` is owner | `owner = to`, `version += 1`, `updatedAt` set | `NAME_NOT_REGISTERED`, `NAME_REVOKED`, `NOT_OWNER` |
| `revoke` | name active, `tx.from` is owner | `status = revoked`, `version += 1`, `updatedAt` set | `NAME_NOT_REGISTERED`, `NAME_REVOKED`, `NOT_OWNER` |

Explicit deterministic rules:

- **First valid registration wins.** Earlier L1 position always takes the name.
- **Revoked names are permanent tombstones.** The record is kept with `status: "revoked"`; no operation (including re-registration by anyone, or anything by the last owner) can touch it again. A name release/re-registration policy is future work and would require a schema version bump.
- **Invalid intents are recorded as rejected**, in order, with `{ reason, op?, name?, from, blockNumber, txIndex, txHash }`. The rejected log is part of derived state and thus covered by the state hash.
- Transfers to the current owner are valid no-ops that still increment `version`.

## 7. Name records and derived state

```ts
interface BsoNameRecord {
  name: string;            // normalized, e.g. "alice.bso"
  owner: string;           // lowercase 0x address
  publicKey: string;       // Bitsocial public key / community address (§5)
  metadataUri?: string;
  version: number;         // 1 on register, +1 per accepted mutation
  status: "active" | "revoked";
  createdAt: { blockNumber, txIndex, txHash, timestamp };  // derived L1 context
  updatedAt: { blockNumber, txIndex, txHash, timestamp };
}
```

Full derived state is `{ schemaVersion, names, rejected, acceptedIntents }`. The **state hash** — used by the demo and tests to prove determinism — is `sha256` over the canonical JSON serialization of that state (object keys sorted recursively, arrays in order). A production appchain would replace this with a real state root/commitment scheme.

## 8. Reorg handling

The node records `{ number, hash }` of the last processed block and, per sync:

1. **Head regression** — if the target height drops below the cursor, reorg.
2. **Anchor check** — if the block at the cursor height no longer has the recorded hash, reorg (catches same/greater-height divergence).
3. **Parent linkage** — while advancing, each new block's `parentHash` must match the previous processed hash, else reorg.

On reorg the POC node discards derived state and re-derives from `startBlock` — registries are small, and full re-derivation is the simplest provably-correct recovery. A `confirmations` option lags the head as a cheap buffer; a production node would follow L1 finality and checkpoint instead. Both reorg paths are integration-tested against a dev chain using `evm_snapshot`/`evm_revert`.

## 9. Read API

Served by the derivation node over HTTP, JSON responses, CORS `*`:

| Route | Returns |
| --- | --- |
| `GET /v1/status` | `{ chainId, startBlock, intentAddress, lastProcessedBlock, stateHash, names, acceptedIntents, rejectedIntents }` |
| `GET /v1/names` | all records (active and tombstoned), sorted by name |
| `GET /v1/names/:name` | `200` record · `400 INVALID_NAME` · `404 NAME_NOT_REGISTERED` · `410 NAME_REVOKED` (tombstone included) |
| `GET /v1/rejected` | the deterministic rejection log |

The read API is a convenience view over local derived state; it carries no authority. Clients that do not want to trust any read API can run the derivation themselves — that is the point of the architecture.
