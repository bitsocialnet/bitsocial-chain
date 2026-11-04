# The Ethereum Economic Zone (EEZ) as a Bitsocial Chain candidate

Research snapshot, 2026-11-05, after the EEZ demos at Devcon (2026-11-04) and Gnosis's announcement that Gnosis Chain relaunches as the first production EEZ network. Sources: eez.io, build.eez.io (including its `llms.txt` and `llms-full.txt`), eez.dev, `github.com/eez-association/eez-core-protocol` (README, `docs/CORE_PROTOCOL_SPEC.md`, `docs/MULTI_PROVER_SPEC.md`, `deployment/README.md`), `github.com/eez-association/eez-rollupX` (README), GnosisDAO GIP-153 on forum.gnosis.io, gnosis.io/chain, and posts from @etheconomiczone, @gnosis_, @tw_tter and @koeppelmann. Companion docs: [RESEARCH_NATIVE_ROLLUPS.md](RESEARCH_NATIVE_ROLLUPS.md), [ECONOMICS_DISCUSSION.md](ECONOMICS_DISCUSSION.md), [DESIGN.md](DESIGN.md), and [BSIP-13](https://bsips.bitsocial.net/bsip-13) (interim `.bso` registry on Ethereum mainnet).

**Status of this document: candidate evaluation, not a decision.** Nothing described here is implemented, and native rollups remain the leading candidate in RESEARCH_NATIVE_ROLLUPS.md.

## TL;DR

- **The EEZ is a rollup framework built around synchronous composability.** A contract on Ethereum or on an EEZ rollup can call a contract on the other chain and use the return value in the same transaction, with no bridge message and no callback. It is built by Gnosis and ZisK, co-funded by the Ethereum Foundation, and works as plain L1 contracts plus real-time proofs, so **it needs no Ethereum hard fork**. That is the main difference from native rollups, which are not scheduled for any fork.
- **It is real on devnets, not in production.** The 2026-11-04 Devcon demos showed a CoW Swap order on a rollup filled against Ethereum mainnet liquidity in one transaction, atomic owner changes between L1 and L2 Safe accounts, and a Falcon post-quantum signature verified on a rollup and used on mainnet for about 91% less gas. The public source proves batches with dev-grade ECDSA attestations, not ZK, and the contracts are labelled early-stage and unaudited.
- **Today it fails Bitsocial's Stage 2 requirement.** The central `EEZ` contract and each rollup's manager are upgradeable proxies with upgrade owners. Each rollup's owner chooses its proof systems, keys and threshold, and holds a `setRoot` owner escape. The first production instance, Gnosis Chain, launches with a centralized sequencer and no forced inclusion. GIP-153 states that "synchronous composability in combination with fast block production is currently only possible in a centralized fashion."
- **Gnosis Chain is not an appchain.** It is a general-purpose EVM L1 (xDAI gas, GNO-staked validators) that GnosisDAO voted on 2026-08-19 (GIP-153) to turn into a ZK-proven EEZ rollup. Its validator set will be retired. It keeps its addresses, state and xDAI gas token. Gnosis now says it launches next spring (gnosis.io: from Q1 2027; GIP-153 originally targeted December 2026 or January 2027).
- **What matters for Bitsocial is liquidity.** Since [BSIP-13](https://bsips.bitsocial.net/bsip-13) moves `.bso` names to an ownerless registry on Ethereum mainnet, the chain decision is now driven by payments, community tokens and AgoraSwap. Synchronous composability would let a Bitsocial Chain trade against BSO and stablecoin liquidity that already sits on L1 instead of bootstrapping thin pools on the L2. That is a direct input to ECONOMICS_DISCUSSION.md Round 6.
- **Recommendation (not a decision):** add the EEZ as a second production candidate next to native rollups, without changing the plan. Keep building portable plain-EVM contracts, and design AgoraSwap so its BSO/stable leg can live on L1. Revisit the EEZ when the five triggers in section 6 are met. BSIP-13 needs no change.

---

## 1. What the EEZ is

The EEZ calls itself "a framework for L2s to work better with each other and Ethereum" (@etheconomiczone). It was introduced on 2026-03-29 and is "built by @Gnosis_ and @ziskvm, co-funded by @ethereumfndn". GIP-153 describes the framework as "a credibly neutral public good, with no token, co-led by Gnosis and ZisK, co-funded by the Ethereum Foundation, under Swiss-foundation governance", and keeps it separate from **Gnosis EEZ**, "a Gnosis-operated deployment of that framework, with GNO economics and xDAI gas".

eez.io pitches it to L1 ("Rollups should extend Ethereum. Not compete with it. ETH is default gas and Ethereum provides settlement and truth"), to protocols ("Plug into shared liquidity and composability") and to dapps ("Users don't think in chains").

### How a synchronous call works

From `eez-core-protocol` and build.eez.io:

- **Two sides.** `src/EEZ.sol` on L1 is the registry and execution manager: per-rollup state roots and ETH accounting, multi-prover batch verification (`postAndVerifyBatch`), per-rollup execution queues, and call execution with a rolling-hash integrity check. `src/L2/EEZL2.sol` on each L2 executes the execution tables the system loads into it.
- **Pre-computed, then proven.** State transitions, including the results of cross-chain calls, are computed off-chain. The batch that carries them is posted and verified on L1 in the same L1 block as the user's transaction. A contract calls a `CrossChainProxy` for the remote contract, and the answer it gets back is an entry "written before your transaction ran". The rolling hash binds what actually executed to what the proof committed to, so a wrong return value, a missing call or a reordering makes the batch revert.
- **Four components in the reference rollup (`eez-rollupX`).** A **sequencer** produces ordinary L2 blocks with a stock reth node. A **composer** builds one Sync block per L1 block carrying the cross-chain work and posts it to `EEZ` on L1 together with the user's L1 transactions, so all of them "land in the *same* L1 block — all or nothing". A **proof signer** re-executes each batch and attests it. A **deriver** rebuilds the whole L2 from L1 `BatchPosted` events and blobs, without trusting the other three.
- **Commit first, repair if needed.** The Sync block is added to L2 immediately. If its L1 submission does not land, the composer swaps it for an empty block, so L2 keeps only what L1 confirms.
- **Multi-prover.** Each rollup's manager contract names its accepted proof systems, their verification keys, and an M-of-N threshold. The registry calls the manager to check them on every batch.

### What was demonstrated (Devcon, 2026-11-04)

Per @etheconomiczone, all on EEZ devnets:

1. **CoW Swap**: "A user on Rollup X signed one order. CoW Swap's solvers filled it against liquidity on Ethereum mainnet and the tokens landed back on Rollup X in the same transaction. No bridge, no wait, no second signature. New chains no longer have to launch with thin pools that users pay for in slippage."
2. **Safe**: owner changes on an L1 Safe are read and verified atomically from L2 Safes, and several Safes share limits as if they were one account.
3. **Post-quantum signature**: a mainnet contract called Rollup X to check a Falcon signature and authorized a mainnet transfer on the answer in the same transaction, for about 91% less gas than the roughly 5.5 million it would cost on L1.

Two devnets are public through eez.dev: ChiadoX on Gnosis's Chiado testnet, and RollupX, which eez.dev describes as an Ethereum mainnet devnet. The EEZ account also says ZisK showed real-time proving on OP Mainnet the same week, which it calls "the key piece that makes synchronous composability work". This document has not verified that demo independently.

Christoph Koeppelmann (Gnosis co-founder), who gave a talk on native rollups two years earlier, said the EEZ launch "even goes beyond what I had imagined back then".

## 2. Status: what is real and what is not

| Part | Status (2026-11-05) |
|---|---|
| L1 `EEZ` contract, L2 `EEZL2`, proxies, rolling-hash checks | Real code, "EARLY-STAGE IMPLEMENTATION — not audited; interfaces and storage layout still in flux" |
| Proofs | **Dev-grade ECDSA.** build.eez.io: "The proof system in the public source is dev-grade ECDSA, not production ZK." The rollupX proof signer re-executes the batch and signs the recomputed public-inputs hash: "This is not yet a succinct validity proof." |
| Reference deployment | Upgradeable `EEZ`, upgradeable `Rollup` manager, ECDSA proof system, **threshold 1** (`deployment/README.md`) |
| Independent re-derivation from L1 | Real (the deriver) |
| Composability direction at Gnosis launch | L2→L1 calls only; "Full bidirectional, cross-instance composability follows" (GIP-153) |
| Real-time ZK proving, bidirectional and nested calls | "expected to land over the course of 2027" (GIP-153) |
| First production network | Gnosis Chain, "next spring" (2027) |

## 3. Gnosis Chain's move

Gnosis Chain is the former xDai chain: a general-purpose EVM L1 with its own GNO-staked validators, 2-second blocks and sub-cent fees. When Gnosis says the EEZ keeps "app-chain cost, speed, and scalability", it means a chain with its own economics, not a chain for one application.

GIP-153 ("Should Gnosis Chain transition into the Ethereum Economic Zone?") passed on 2026-08-19 with 123,158 GNO for and 115 against. What it commits to:

- The validator set is retired and settlement moves to Ethereum. About 350k staked GNO (about 27% of circulating supply) unlocks, and the treasury-funded staking subsidy ends in favour of fee capture.
- "Users and dapps keep their addresses, balances, and contract state with full continuity, xDAI remains the fee token." **EEZ rollups can therefore use a gas token other than ETH.**
- "At launch, sequencing is centralized: Gnosis Ltd operates the composer that orders transactions, builds blocks, and submits them for proving and L1 settlement." The bound on the sequencer is that "every block is proven and settled on Ethereum, so the sequencer cannot forge state, steal funds, or roll back finalized history", so its possible harm "is limited to delaying or excluding transactions". Forced inclusion through L1 is among the "options to evaluate then, not launch features."
- The trade-off is explicit: "Synchronous composability in combination with fast block production is currently only possible in a centralized fashion." And: "a chain that is operated rather than maximally neutral can be opinionated about security. It can hold suspect transactions and try to protect users from obvious hacks."
- Governance splits. "EEZ governance (Ethereum-led) governs rollup protocol changes, prover specification, and L1-to-L2 messaging primitives", while GnosisDAO governs gas token policy and fees. Today's bridge validators become the initial operators of the M-of-N provers.

In short, Gnosis is giving up a large independent validator set in exchange for Ethereum settlement and atomic access to mainnet liquidity. Friederike Ernst's summary ("We built Gnosis Chain to scale what Ethereum couldn't yet. Now Ethereum can be the settlement layer for all of it") is accurate, with one caveat: "composing synchronously with L1" will be one-directional at launch.

## 4. Fit for Bitsocial Chain

### What changed with BSIP-13

[BSIP-13](https://bsips.bitsocial.net/bsip-13) (Draft, 2026-11-04) puts `.bso` names in an ownerless, non-upgradeable fork of GNS on Ethereum mainnet now. It is temporary: when Bitsocial Chain launches, the fee recipient may call `sunset()`, which freezes the registry after 30 days, and a later BSIP for the chain's registry must import the frozen state at no charge. Two consequences for this evaluation:

1. **Names are no longer the reason to pick a chain.** The chain's job is payments, community tokens and AgoraSwap. Those are exactly the features where access to liquidity decides whether the venue works.
2. **BSIP-13 is architecture-neutral, so it needs no change.** The registry is plain EVM with the ENS `text(node, key)` interface, so it runs unchanged on any EVM chain, which is the strategy both this document and RESEARCH_NATIVE_ROLLUPS.md recommend. Nothing in BSIP-13 forces a sunset, so if an EEZ-style chain could read the L1 registry synchronously, keeping names on L1 and never migrating would remain an option.

### Where the EEZ fits

| Need (source) | EEZ answer |
|---|---|
| No hard dependency on Ethereum's fork schedule (RESEARCH_NATIVE_ROLLUPS.md §3, §9) | Met: plain contracts on today's L1 |
| AgoraSwap needs liquidity without bootstrapping thin pools (ECONOMICS_DISCUSSION.md Rounds 2 and 6) | Strongest fit of any candidate: L2 orders can fill against L1 liquidity in one transaction (CoW demo) |
| BSO as gas | Plausible: the framework supports a non-ETH gas token (Gnosis keeps xDAI) |
| Full EVM, batching, blob DA | Met (reth-based L2, batches in blobs) |
| Anyone can rebuild state from L1 (README) | Met: the deriver rebuilds the L2 from L1 data alone |
| Validity proofs (DESIGN.md "What is missing" #1) | Not yet: ECDSA attestations today, real-time ZK planned for 2027 |
| No upgrade authority over user funds (Stage 2) | **Not met:** the shared `EEZ` contract, which holds per-rollup ETH accounting, is an upgradeable proxy, and so is each rollup's manager |
| No owner over rollup state | **Not met by the reference manager:** its owner sets proof systems, keys and threshold and can call `setRoot` |
| Inclusion without an operator (POC property; ECONOMICS_DISCUSSION.md Q7) | **Not met at launch:** centralized composer, no forced inclusion |

### The tension, stated plainly

Native rollups make Ethereum's own fork process the only upgrade authority, at the price of waiting for forks that are not scheduled. The EEZ ships without a fork, at the price, today, of an upgrade owner and an operator. For an ownerless Stage 2 chain the question is whether the EEZ can drop both:

- **Posting is already permissionless at the contract level.** `postAndVerifyBatch` can be called by "Anyone (proofs verify authorization)". With real ZK proof systems, anyone holding a valid proof could post, and the core README describes the protocol as composability "between based rollups sharing the same L1 sequencer". A based, permissionless EEZ rollup therefore looks possible in principle. Its cost is that every Sync block must be built and proven within one L1 slot, so the composer and a real-time prover sit on the critical path for synchronous calls. GIP-153 says doing that with fast blocks is "currently only possible in a centralized fashion".
- **An ownerless manager pins its keys.** `IRollupContract` is pluggable, so a Bitsocial manager could have no owner, no `setRoot`, and fixed verification keys. That recreates the "pin" branch of RESEARCH_NATIVE_ROLLUPS.md §4 in a worse form: there is no EIP-8357 registry to follow, so the chain could never adopt a new EVM version or replace a broken prover. M-of-N proving softens the soundness risk; it does not remove it.
- **The shared `EEZ` contract is the hard part.** Even an ownerless Bitsocial manager would depend on the upgrade owner of the central registry. Stage 2 needs that contract to be immutable, or upgradeable only with an exit window of at least 30 days. Who holds that key in production is not stated beyond "EEZ governance (Ethereum-led)".
- **An operated chain contradicts the thesis.** Gnosis presents the ability to "hold suspect transactions" as a feature. For a censorship-resistant social protocol's money layer, that ability is the risk. Running Bitsocial Chain on Gnosis's instance would hand that power to Gnosis Ltd, and running our own instance with our own composer would hand it to us, which conflicts with the rule that no company, Forge included, becomes a chokepoint.

Native rollups and the EEZ are not mutually exclusive. The per-rollup manager is pluggable, so a manager that verifies blocks through EIP-8357 once it exists looks feasible. That is an open question for the EEZ team, not something either project has stated.

## 5. Implications

1. **AgoraSwap: design for L1 liquidity reachability.** ECONOMICS_DISCUSSION.md Round 6 assumes a deep BSO/stable bridge pair. If synchronous composability reaches production with acceptable trust, that leg can stay on L1, where BSO's liquidity already is, while community-token/BSO markets run on the chain. **Recommended direction (not a decision):** keep AgoraSwap's mechanism (batch auctions, intents and solvers) agnostic about where the counter-liquidity sits, so solvers can fill against L1 pools. The CoW demo is this pattern.
2. **Keep everything plain EVM.** Unchanged from RESEARCH_NATIVE_ROLLUPS.md §7 option A, and BSIP-13 already follows it. Nothing built now should depend on the EEZ proxy interface, which the docs call "still in flux".
3. **Names: no change.** The L1 registry in BSIP-13 is the reference. On an EEZ chain, L2 contracts could read it through a proxy, which only needs L2→L1 calls, the direction available at Gnosis's launch. Whether to sunset and migrate can then be decided on cost, not necessity.
4. **Treat the EEZ as a candidate, not the leading one.** On liquidity and timing it beats native rollups; on trust it is behind until section 6's triggers are met.

## 6. Triggers to re-evaluate

Re-open the choice when all of these hold:

1. **Real ZK proof systems** replace ECDSA attestations on a public network, with real-time proving per L1 slot.
2. **A Stage 2 upgrade path for the shared `EEZ` contract**: immutable, or upgradeable only with an exit window of at least 30 days.
3. **An ownerless rollup manager** (no `setRoot`, no owner-set keys or threshold) supported as a configuration, with a credible answer to EVM upgrades and prover bugs.
4. **Inclusion without trusting an operator**: permissionless posting with public provers (based), or forced inclusion through L1.
5. **Bidirectional composability** (L1→L2) in production, since L1 contracts calling into Bitsocial Chain matters for BSO flows that start on mainnet.

Signals to watch: Gnosis EEZ genesis and its first L2BEAT assessment, the second-stage GIP on prover appointments and sequencing, `eez-core-protocol` audits and an interface freeze, and any EEZ statement on Stage 2.

## 7. Risks

- **Young and moving.** `eez-core-protocol` was created in January 2026, is unaudited, and calls its interfaces and storage layout "still in flux".
- **Operator by default.** The first instance is centralized with no forced inclusion. Censorship resistance is deferred to a future DAO decision based on "what degree of censorship resistance the ecosystem actually needs".
- **Shared-contract risk.** Every EEZ rollup's L1 accounting goes through one upgradeable contract, a single point of failure across instances.
- **Timelines slip.** Gnosis's genesis moved from "December 2026/ Jan 2027" (GIP-153) to spring 2027, and real-time ZK proving is a 2027 item.
- **Concentration.** Gnosis Ltd co-leads the framework and operates its first instances; GIP-153 positions it "at the center of the emerging market for EEZ deployment".

## 8. Sources

- @etheconomiczone launch thread and demo posts, 2026-11-04 (`x.com/etheconomiczone/status/2117866567685849443` and replies); demo cut `x.com/etheconomiczone/status/2117942273451393046`; Devcon talk "One Ethereum: Same Block, Every Chain" (`x.com/etheconomiczone/status/2118067134228226170`, not reviewed for this snapshot)
- @gnosis_ announcement (`x.com/gnosis_/status/2117959772515488227`), Friederike Ernst (`x.com/tw_tter/status/2118040215394865380`), Christoph Koeppelmann (2026-11-04)
- eez.io (home, captured 2026-11-05), eez.dev (network chooser), build.eez.io and its `llms.txt` / `llms-full.txt` (25 walkthroughs pinned to `eez-core-protocol@9a1f815` and `eez-rollupX@2c19e36`)
- `github.com/eez-association/eez-core-protocol`: README; `docs/CORE_PROTOCOL_SPEC.md` (§I.4 access control, per-rollup ownership, `setRoot`); `docs/MULTI_PROVER_SPEC.md` (threshold, owner escape, trust boundaries); `deployment/README.md` (upgradeable proxies, ECDSA, threshold 1)
- `github.com/eez-association/eez-rollupX` README (four components, commit-first, proof signer)
- GnosisDAO GIP-153, forum.gnosis.io topic 12397 (sections 3 to 7); vote result per The Defiant, "Gnosis Chain to Abandon Its Validator Set and Settle to Ethereum" (2026-08-19); gnosis.io/chain ("From Q1 2027")
- [BSIP-13](https://bsips.bitsocial.net/bsip-13), Interim .bso Name Registry (Draft, 2026-11-04)
