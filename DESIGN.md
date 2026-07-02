# Design — Why this POC looks the way it does

Companion to [SPEC.md](SPEC.md) (the normative rules) and [POC_LIMITATIONS.md](POC_LIMITATIONS.md) (the shortcuts). This document explains the reasoning.

## Why .bso names are the first POC feature

Phase 2 of the Bitsocial master plan proposes Bitsocial Chain as the economic layer for Bitsocial apps: "unstoppable financial structures, decentralized Bitsocial domains (.bso), awards and tipping, common liquidity, and practical monetization."

Names are the right first primitive because they are:

- **Already real in the product.** Bitsocial clients resolve `.bso` names today via the BSO Resolver — but as an alias of `.eth`: `alice.bso` is rewritten to `alice.eth` and looked up as a `bitsocial` ENS TXT record. That inherits ENS contracts, ENS pricing, and ENS governance. A native registry removes that dependency while keeping the exact same record payload (an IPNS-style public key plus optional metadata).
- **Small and judgeable.** A name registry has a tiny state machine — register/update/transfer/revoke — so the interesting property (deterministic L1-derived state) is easy to demonstrate and audit without drowning in product scope.
- **Economic, not social.** Names are ownership and location, the first durable economic primitive, without touching the P2P social layer.

## How this fits the Bitsocial roadmap

Phase 1 builds the wedge apps (5chan, Seedit) and the public RPC layer; Phase 2 adds the economic layer so those apps gain network effects that centralized competitors can't choke off; Phase 3+ build the flagship profile-based app on top. This repo is the first Phase-2 artifact: it proves the architecture Bitsocial Chain primitives should share — Ethereum-anchored, derivable by anyone, no operator in the trust path — on the smallest useful feature.

## Social data stays P2P

Bitsocial communities and identities are keypair-controlled objects addressed by public-key hashes; content moves over IPFS/libp2p pubsub with challenge-based anti-spam. Nothing in this design changes that:

- The chain stores **name → public key** bindings, not content. The record's `publicKey` is the same IPNS-style key clients already use to find a community or profile over the P2P protocol.
- Posts, comments, votes, moderation state, member lists, and feeds never appear in intents, derived state, or the read API — the intent schema has nowhere to put them, by construction.
- If Bitsocial Chain disappeared tomorrow, communities and identities would keep working; only the human-readable naming (and future economic features) would degrade.

## Privacy compatibility is a design requirement

Bitsocial is social software, and social software is often used for speech, association, organizing, donations, and public argument. The economic layer must not make it unnecessarily easy for chain analysts, platforms, employers, or governments to reconstruct a user's social graph and finances just because they tip, receive awards, or pay for app features.

The core Bitsocial Chain appchain is therefore **transparent by default, privacy-compatible by design**:

- **The core protocol does not implement privacy tech itself.** This repo should not become a bespoke mixer, shielded pool, private wallet, or Monero-style privacy chain. Those systems need specialist cryptography, audits, and legal/regulatory risk analysis. Bitsocial Chain should instead expose simple, composable protocol surfaces that third-party privacy projects can integrate with.
- **The protocol must not assume one address is one person.** Future economic intents should work with fresh addresses, account-abstraction wallets, delegated execution, relayers, and privacy-preserving wallets. Address rotation must be treated as normal user behavior, not suspicious behavior or a broken edge case.
- **Tipping and payments should avoid mandatory identity linkage.** A future tipping primitive should not require a tipper to write their `.bso` name, profile key, post ID, or long-lived app account into public appchain state. Public attribution can be an opt-in app-layer feature; private or pseudonymous tipping must remain possible.
- **Privacy adapters should be welcome at the edges.** If projects like Railgun-style shielded pools, stealth-address wallets, private bridges, zero-knowledge membership proofs, or other privacy tools want to support Bitsocial Chain, the chain should make that boring: stable intent formats, no protocol-level blocklists against privacy contracts, and no special dependency on a single official wallet or RPC.
- **The chain should accept proofs and commitments without knowing everything.** Future schemas should be able to represent claims such as "a valid tip was paid", "this user is eligible", or "this account owns a capability" using commitments, nullifiers, receipts, or zero-knowledge proofs, without forcing every underlying sender, receiver, amount, or wallet history into public state.
- **Read privacy matters too.** Users should be able to run their own derivation node, query several nodes, or use privacy-preserving network paths. A production roadmap should leave room for private-read techniques such as light-client verification, Tor-friendly endpoints, private information retrieval, and client-side proof verification.
- **Selective disclosure beats forced disclosure.** Apps can still offer public badges, public award counts, public donation pages, and reputation features, but those should be choices made by the user or app community. The base chain should preserve a path for users who need unlinkability between their speech identity and their wallet activity.

This mirrors the [Ethereum privacy framing](https://ethereum.org/privacy/): public ledgers are powerful because anyone can verify them, but privacy for writes, reads, and proofs is required for real-world safety. [Monero](https://www.getmonero.org/get-started/what-is-monero/) shows the opposite end of the design space, with sender, receiver, and amount privacy built in by default. Bitsocial Chain intentionally does not make that default promise; it should instead remain a transparent L2/appchain whose schemas, clients, wallets, and bridges are easy for external privacy systems to shield later.

## How L1 intents become appchain state

The design follows the Ethscriptions/Facet derivation pattern:

1. A user sends a plain Ethereum L1 transaction to the inbox address `0x…b50b50` with calldata `data:application/vnd.bso.intent+json,{…}`.
2. Every derivation node follows L1 blocks in order and picks out intent attempts (to-address + calldata prefix).
3. Each attempt runs through the deterministic state transition rules in SPEC.md §6 — first-valid-wins registration, owner-only mutation, permanent tombstones, deterministic rejections.
4. Derived state is persisted locally and exposed over a read API; a canonical state hash lets any two nodes check they agree.

Ethereum L1 provides ordering, data availability, censorship resistance, and signature-based authentication (`tx.from`). The derivation layer provides meaning. Neither layer has an operator.

## How a Bitsocial client resolves a .bso name

```
client → BsoChainResolver.resolve({ name: "alice.bso" })
       → GET <derivation node>/v1/names/alice.bso
       → { name, owner, publicKey, metadataUri?, version }
       → client uses publicKey on the existing P2P protocol
```

The resolver SDK mirrors the existing BSO Resolver's `NameResolverInterface` shape (`canResolve` / `resolve({ name, abortSignal })` / `destroy()`, `undefined` for unresolvable names), so a client like Seedit or 5chan can plug it into the same `nameResolvers` array it uses today — running against a self-hosted node, an app-provided node, or several nodes cross-checked.

## Inspiration: Ethscriptions and Facet

- From **Ethscriptions**: the calldata data-URI convention; valid state is whatever the open indexing rules say about raw L1 transactions; anyone can re-index from genesis.
- From **Facet**: the magic inbox address as the entire "contract surface" of the chain; state lives only in the derivation layer, so there is no L1 contract to upgrade or admin.
- Deliberately simplified for the POC: a single-purpose TypeScript derivation node and a JSON state file replace the full appchain node/indexer stack; a sha256 canonical-JSON hash replaces a state root.

### Alternatives considered

- **A. Fork the Ethscriptions appchain stack** (ethscriptions-node/indexer/kona): maximal realism, but adapting a general-purpose inscription chain to one registry primitive would have cost far more than it taught for a first POC. The migration path back to it stays open because the L1 data model is the same.
- **B. Standalone TypeScript derivation POC** — chosen. Smallest thing that demonstrates the architecture honestly, runnable with `npm install` alone.
- **C. Build on Facet tooling**: ties the POC to Facet's chain and SDK semantics before Bitsocial has decided to live inside another project's appchain rather than its own.

Within B, two intent transports were considered: an **immutable Solidity inbox contract emitting events** (cheaper indexing via logs, but adds a compile/deploy step and an L1 artifact) versus the **calldata convention** (no contract at all, closest to the inspiration, nothing on L1 to even theoretically capture). The POC uses the calldata convention; an event-based inbox remains a reasonable future optimization for indexing and would not change the trust model if kept immutable and admin-free.

## Decentralization properties inherited from Ethereum

- **Ordering and finality** of all intents — no sequencer exists in this design, so there is nothing to decentralize later in the intent path.
- **Data availability**: the full registry history is ordinary L1 calldata, retrievable from any Ethereum node.
- **Censorship resistance**: anyone who can get a transaction into an Ethereum block can register or manage a name; there is no relayer, allowlist, or admin in between.
- **Authentication**: ownership is L1 signature possession; no platform account, no recovery backdoor.
- **Exit/fork-ability**: because state is derived, the community can fork the rules and re-derive — the history can't be held hostage.

## Trust assumptions remaining in the POC

- **You trust the derivation node you query** (like trusting an RPC). Mitigations available now: run your own node (`npm install` + a JSON-RPC endpoint) or cross-check `stateHash` across independent nodes. Mitigation needed for production: proofs (below).
- The POC runs against a **local dev chain**, not mainnet — real L1 costs, reorg depths, and adversarial traffic are unmodeled.
- The reference implementation is the spec's only complete implementation so far; independent implementations would harden it.
- Resolver results are served over plain HTTP with no commitment verification.

## What is missing before a real Stage 2 launch

Stage 2 (per L2Beat-style maturity standards) needs more than "no admin keys", which this POC has by construction. Missing:

1. **A proof system.** Today equivocating read APIs can only be caught by re-derivation. Production needs validity proofs (zk over the derivation function) or permissionless fault proofs with a challenge game, so light clients can verify `stateHash` against L1 without re-deriving.
2. **Challenge rules and bonds** — who can challenge, timeouts, slashing economics.
3. **An upgrade/exit model** — how rules change (schema `v` bumps) with user-protecting delays, and what "exit" means for name ownership if the project dies.
4. **Finality-aware derivation** — follow finalized L1 blocks with checkpointed state instead of POC re-derivation-from-genesis.
5. **Economics** — registration pricing/anti-squatting, fee routing, and the renewal/expiry question (the POC has none).
6. **Security review** of the spec (normalization edge cases, intent malleability) and implementations.
7. **Real state commitments** (verkle/merkle state root) replacing the canonical-JSON sha256.
8. **A privacy-compatibility review** before adding tipping, awards, payments, or shared liquidity: every new intent should be checked for unnecessary linkage between social identity, wallet identity, amounts, counterparties, and read/query metadata.

## How this expands to the rest of Bitsocial Chain

The pattern generalizes: every future primitive is *intents on L1 → deterministic derivation → small economic state*, never social content.

- **Awards/tipping**: intents referencing a recipient public key or `.bso` name; derived balances/award records; clients render them next to P2P content they fetched themselves.
- **Payments/monetization**: payment intents settle value on L1 (or a real L2); derived state only indexes receipts/entitlements that clients may choose to honor (e.g. badge challenges).
- **Shared liquidity**: token/AMM-style primitives are exactly what graduating to the real Ethscriptions/Facet-style appchain stack (path A) is for.

Each addition is a new intent namespace and a new reducer over the same inbox pattern — the social layer never moves on-chain, and apps/RPCs/discovery stay replaceable.

For economic features, the reducer should store the minimum public state required for verification and UX. A tip can be publicly displayed when the sender wants credit, but the protocol should not require public sender identity, public recipient identity, and public amount to all be linked forever. Where practical, future designs should prefer opaque receipts, commitments, nullifiers, proof-verifiable entitlements, and app-layer display choices over hard-coding a fully transparent social-financial graph.
