# Bitsocial Network

Proof of concept for **Bitsocial Network**, the proposed Ethereum L2/appchain economic layer for [Bitsocial](https://bitsocial.net) apps ([Phase 2 of the master plan](https://bitsocial.net/#master-plan-phase-2)).

This POC implements exactly one primitive: **decentralized `.bso` names** whose registry state is derived deterministically from Ethereum L1 history, in the spirit of [Ethscriptions](https://github.com/ethscriptions-protocol) and [Facet](https://github.com/0xFacet).

> **This is not production Stage 2; this is a Stage-2-shaped proof of concept for .bso naming.**

## What this POC proves

- A `.bso` name (e.g. `alice.bso`) can be registered, updated, transferred, and revoked using **plain Ethereum L1 transactions** — no sequencer, no admin keys, no contract.
- Registry state is a **pure function of L1 history**: anyone can run the derivation node and reconstruct byte-identical state (the demo and tests verify matching state hashes across independent derivation runs).
- A name resolves to a **Bitsocial public key / community address** — the same IPNS-style keys Bitsocial clients resolve through the [`bitsocial` ENS TXT record](https://bitsocial.net/docs/infrastructure/bso-resolver/) today — through a resolver SDK that is shape-compatible with [`@bitsocial/bso-resolver`](https://github.com/bitsocialnet/bso-resolver).
- Social content stays peer-to-peer: nothing social goes on-chain. Names are a locator/ownership primitive, not a data layer.
- The long-term appchain posture is **transparent by default, privacy-compatible by design**: this POC does not shield activity, but future tipping/payment schemas should avoid forced linkage between social identity and wallet history, and should leave room for external privacy systems such as shielded pools, stealth addresses, relayers, and zero-knowledge proofs. See [DESIGN.md](DESIGN.md#privacy-compatibility-is-a-design-requirement).

## What it does not prove

- No production proof system, fault proofs, or challenge rules — derived state is verified by re-derivation, not by proofs.
- No mainnet deployment, no audited code, no economics or pricing, no governance.
- No built-in privacy system: `.bso` ownership and intent transactions are public in this POC. Privacy is a compatibility requirement for future economic features, not an implemented feature here.
- See [POC_LIMITATIONS.md](POC_LIMITATIONS.md) for the full honest list.

## How it works

```
        register / update / transfer / revoke intents
        (calldata: data:application/vnd.bso.intent+json,{...}
         sent to the inbox address 0x…b50b50)
                            │
                            ▼
 ┌──────────────────────────────────────────────────────┐
 │                    Ethereum L1                       │
 │   (the only source of truth; POC runs a local chain) │
 └──────────────────────────────────────────────────────┘
                            │  blocks + transactions, in order
                            ▼
 ┌──────────────────────────────────────────────────────┐
 │   derivation node  (node/)        — anyone can run   │
 │   deterministic state transition over L1 history     │
 │   → .bso registry + state hash, persisted locally    │
 └──────────────────────────────────────────────────────┘
                            │  read API (HTTP/JSON)
                            ▼
 ┌──────────────────────────────────────────────────────┐
 │   resolver SDK  (resolver/)                          │
 │   alice.bso → { owner, publicKey, metadataUri, … }   │
 └──────────────────────────────────────────────────────┘
                            │
                            ▼
        Bitsocial clients (Seedit, 5chan, flagship app, …)
        use the public key to find communities/identities
        over the existing P2P protocol — content stays off-chain
```

There is deliberately **no L1 contract** in the intent path: an intent is any transaction to the designated inbox address whose calldata carries the documented data URI. Validity is decided entirely by the open derivation rules in [SPEC.md](SPEC.md), so there is nothing on L1 to upgrade, censor, or seize. (An immutable Solidity inbox emitting events was the considered alternative; see [DESIGN.md](DESIGN.md).)

## Repository layout

| Directory   | Package                           | What it is |
| ----------- | --------------------------------- | ---------- |
| `protocol/` | `@bitsocial/bso-network-protocol` | Deterministic core: intent calldata codec, name normalization, state transition rules, canonical state hash |
| `node/`     | `@bitsocial/bso-network-node`     | Derivation node: follows L1 over JSON-RPC, applies the protocol, persists state, serves the read API, handles reorgs |
| `resolver/` | `@bitsocial/bso-network-resolver` | Minimal resolver SDK, shape-compatible with `@bitsocial/bso-resolver` |
| `demo/`     | `@bitsocial/bso-network-demo`     | Runnable end-to-end demo on a local L1 dev chain |

Docs: [SPEC.md](SPEC.md) (normative protocol rules) · [DESIGN.md](DESIGN.md) (rationale and roadmap fit) · [POC_LIMITATIONS.md](POC_LIMITATIONS.md) (shortcuts taken).

## Setup

Requires Node.js >= 22 (see `.nvmrc`).

```bash
git clone https://github.com/bitsocialnet/bitsocial-network.git
cd bitsocial-network
npm install
npm run build
```

## Run the tests

```bash
npm test
```

Covers name normalization, the intent codec, every state transition rule (valid/duplicate registration, unauthorized/authorized updates, transfer, revoke, invalid intents), resolver behavior, and — against a real local L1 — end-to-end derivation, deterministic replay (two clean derivations produce the same state hash), persistence/resume, and reorg detection.

## Run the demo

```bash
npm run demo
```

The demo starts a local Ethereum L1 (Hardhat node), runs a derivation node against it, then walks the full lifecycle with plain L1 transactions: register `alice.bso` → resolve it → rejected hijack attempts (duplicate registration, non-owner update) → update → transfer → revoke. It finishes by re-deriving the registry from genesis with a second, fresh node and asserting both nodes computed the same state hash.

## Run a node yourself

```bash
# terminal 1: any local Ethereum dev chain
npx hardhat node

# terminal 2: the derivation node
node node/dist/cli.js --rpc-url http://127.0.0.1:8545 --port 4150

# resolve a name over the read API
curl http://127.0.0.1:4150/v1/names/alice.bso
curl http://127.0.0.1:4150/v1/status
```

## Resolver usage

```ts
import { BsoNetworkResolver } from "@bitsocial/bso-network-resolver";

const resolver = new BsoNetworkResolver({ endpoint: "http://127.0.0.1:4150" });

resolver.canResolve({ name: "alice.bso" }); // true
await resolver.resolve({ name: "alice.bso" });
// {
//   name: "alice.bso",
//   owner: "0xf39f…",
//   publicKey: "12D3KooWN5rLmRJ8fWMwTtkDN7w2RgPPGRM4mtWTnfbjpi1Sh7zR",
//   metadataUri: "ipfs://…",   // optional
//   version: 1
// }
await resolver.destroy();
```

`canResolve` / `resolve({ name, abortSignal })` / `destroy()` mirror the existing BSO Resolver, so a Bitsocial client can stack this resolver alongside (or behind) the ENS-TXT-record one in the same `nameResolvers` list.

## How this relates to Bitsocial apps

Bitsocial communities and identities are controlled by keys and addressed by public-key hashes; apps, RPCs, discovery, and hosting are all replaceable. What `.bso` names add is a durable, human-readable, **ownable** locator for those keys that no registrar, DNS provider, or platform can seize — because the registry rules live in open derivation code over Ethereum history rather than in any operator's database. Posts, votes, moderation, and feeds never touch the chain; a client resolves `alice.bso` to a public key once, then talks to the P2P network exactly as it does today.

The same L1-derived pattern is meant to later carry the rest of Bitsocial Network (awards, tipping, payments, shared liquidity) without ever putting social content on-chain — see [DESIGN.md](DESIGN.md).

## Stage 2 disclaimer

This POC follows Stage-2-shaped design targets — no sequencer required for correctness, state derived from L1 only, anyone can run the node, no admin keys in the core rules — but **it is not production Stage 2**. There is no proof system, no challenge game, no exit mechanism, and no security review. [POC_LIMITATIONS.md](POC_LIMITATIONS.md) and the "Path to a real Stage 2" section of [DESIGN.md](DESIGN.md) spell out what is missing.

## License

[GPL-3.0-or-later](LICENSE)
