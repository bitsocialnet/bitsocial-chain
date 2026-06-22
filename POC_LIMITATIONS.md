# POC Limitations

Every important shortcut in this proof of concept, stated plainly. See DESIGN.md ("What is missing before a real Stage 2 launch") for the constructive view of the same list.

## Maturity

- **Not production Stage 2.** This is a Stage-2-shaped proof of concept for `.bso` naming: it has the *shape* (no sequencer, no admin keys, L1-derived state, anyone can run a node) but none of the machinery that makes Stage 2 a real claim.
- **No proof system.** There are no validity proofs and no fault proofs. A wrong or lying derivation node can only be detected by re-deriving from L1 yourself or comparing state hashes across nodes. No challenge game, bonds, or slashing exist.
- **No audited code and no audited spec.** Nothing here has had a security review. Normalization, intent parsing, and the state machine are tested but not adversarially reviewed.
- **No real mainnet deployment.** Everything runs against a local Hardhat dev chain. Mainnet gas costs, deep reorgs, MEV, and adversarial intent traffic are unmodeled. The inbox address itself is a POC vanity constant that could be revisited before any real deployment.

## Economics and governance

- **No economics or pricing.** Registration is free except for L1 gas, which invites mass squatting; there is no auction, renewal, expiry, or anti-squatting mechanism. Final pricing/tokenomics are explicitly out of scope.
- **No final governance model.** How protocol rules evolve (schema version bumps), who stewards them, and with what user protections is undecided.
- **No canonical bridge and no bridge assumptions.** Nothing moves value between L1 and the derived layer; if value transfer is added later it needs its own design and proofs.

## Protocol shortcuts

- **No built-in privacy or shielding.** `.bso` owner addresses, intent transactions, timestamps, and state changes are public to anyone following L1 or the derived read API. This POC only documents a future compatibility requirement: economic features such as tipping and payments should be designed so users can later use external privacy tools without the base protocol forcing permanent links between social identity, wallet identity, counterparties, and amounts.
- **Permanent tombstones.** Revoked names can never be re-registered. A release/expiry policy is future work and will require a schema version bump.
- **Single-label names only.** No subdomains; max label length 63; no Unicode/IDN support — the conservative ASCII subset avoids homograph questions the POC doesn't want to answer yet.
- **Receipt status is not checked.** Safe while the inbox address has no code (such transactions cannot revert), and nobody can deploy code to a vanity address without its key; documented here for full transparency.
- **State hash ≠ state root.** Determinism is checked with sha256 over canonical JSON, which proves nothing by itself to a third party; a production chain needs real state commitments and proofs against them.
- **JavaScript-number block heights/timestamps** (safe integers) — fine for any realistic chain today, but a portability assumption other implementations must match for hash equality.

## Node and infrastructure shortcuts

- **Storage/indexing choice is not final.** Derived state can persist through the original atomic-write JSON file or an experimental local Turso Database store behind the same small `StateStore` interface. The Turso path is a useful step toward a real node, but this POC still stores one canonical state blob; production indexing, checkpointing, and query tables remain future work.
- **Reorg handling is rebuild-from-genesis.** Correct and simple for small state, but a production node must follow L1 finality and checkpoint instead of re-deriving everything.
- **Polling JSON-RPC follower.** No websocket subscriptions, no batched backfill, no rate-limit handling; long historical ranges would sync slowly.
- **The read API is unauthenticated plain HTTP** with no commitment to the data it serves. It is a local convenience view, not an authority.

## Centralized assumptions in the demo

- The demo (and tests) run their own single local L1 (Hardhat) and a derivation node in the same process — a closed system for demonstration. The determinism check (a second fresh node re-deriving identical state) is honest, but a real deployment's decentralization comes from *many parties* running nodes against *public* L1, which a laptop demo cannot exhibit.
- Demo accounts are Hardhat's well-known dev keys; no wallet integration or onboarding exists (out of scope by design).
- The resolver SDK trusts whatever single endpoint it is given; the demo points it at the local node.
