# Native rollups and a .gwei fork for Bitsocial Chain

Research snapshot, 2026-10-05; status updated 2026-10-26 after EIP-8357 was merged as a Draft. Sources: nativerollups.fyi (live explorer and its About page), l2beat.com/native-rollups, EIP-8079, EIP-8288, EIP-8357 (merged Draft text), EIP-8142, coverage of the Hegotá fork scope, and github.com/lucadonnoh/gwei-names. Companion docs: [DESIGN.md](DESIGN.md), [ECONOMICS_DISCUSSION.md](ECONOMICS_DISCUSSION.md), [RESEARCH_AZTEC_VS_FACET.md](RESEARCH_AZTEC_VS_FACET.md).

**Status of this document: candidate evaluation, not a decision.** The `.bso` POC in this repo remains the reference for the naming primitive. Nothing described here is implemented.

## TL;DR

- **A native rollup is an L2 whose blocks Ethereum verifies with its own EVM proof program**, the same stateless validation program L1 is moving toward for its own blocks. There are no bespoke verifier contracts or proof routers to deploy and govern, and verifier fixes ship in Ethereum client releases.
- **It covers the gaps this repo already documents.** DESIGN.md lists a proof system, a challenge game, and real state commitments as missing for Stage 2. ECONOMICS_DISCUSSION.md names batching, DA, and sequencing as the real AgoraSwap blocker. The POC's L1-calldata derivation pattern solves none of these; a native rollup addresses all of them.
- **BSO gas and BSO fee burning fit the design.** Native rollups support a custom gas token bridged from L1 through Ethereum-native messaging, and custom handling of the base fee (burn, or direct it elsewhere).
- **It cannot ship yet.** Per L2BEAT, native rollups are "not part of any scheduled Ethereum hard fork," and the mandatory execution proofs they need are "expected in K* at the earliest." Block-in-Blobs (EIP-8142), which binds L2 block data to blobs, was declined for Hegotá. The nativerollups.fyi devnet runs everything real except what L1 does not have yet: blocks are signed by a trusted key instead of proven, and the L1 proof check (EIP-8288) and in-program blob check (EIP-8142) are mocked. Since October 2026 the verification key registry (EIP-8357) is the real contract, with a placeholder key hash. Bitsocial does not control this timeline.
- **Sequencing becomes the main open decision.** A native rollup's contract chooses centralized sequencing with preconfirmations, based sequencing, or a staked set. That choice decides whether the POC's "no operator" property survives. It is ECONOMICS_DISCUSSION.md open question 7 in concrete form.
- **Following or pinning L1's EVM is the second.** EIP-8357 lets a rollup contract follow the current EVM verification key, inheriting every L1 execution upgrade, or pin a historical one. For an ownerless, non-upgradeable rollup contract the choice is permanent. Following risks a halt at an L1 fork if no prover is ready; pinning keeps a key that is never revoked even if later found insecure. Recommended direction: follow (section 4).
- **A fork of the .gwei name service (GNS) is a strong candidate for `.bso` on that chain.** GNS is ownerless, non-upgradeable, MIT-licensed, and ENS-compatible, including text records, so the `bitsocial` record clients already read carries over. It has fixed burned fees, expiry, and anti-snipe premiums, which is the economics the POC lacks. It would replace this POC's [SPEC.md](SPEC.md) rules, not extend them.
- **Recommendation:** name native rollups as the leading candidate for the production chain without committing to it, and keep everything built in the meantime as plain EVM contracts so it can move. The Bitsocial-side work that is useful now is a `.bso` fork of GNS on a local or test EVM chain.

---

## 1. What native rollups are

The design has gone through three proof paths:

1. **EXECUTE precompile ([EIP-8079](https://eips.ethereum.org/EIPS/eip-8079), Draft, created 2025-11-13; Luca Donno and Justin Drake).** Exposes Ethereum's state transition function as a precompile that a rollup contract calls to verify L2 blocks. It follows Justin Drake's January 2025 ethresear.ch post "Native rollups—superpowers from L1 execution". The ethrex / LambdaClass team demonstrated it with L1 re-execution in March 2026, which L2BEAT describes as "a prototype rather than the target ZK architecture."
2. **Native proof verification (ethresear.ch, May 2026).** L2 blocks become *proof-carrying transactions* on L1. A new transaction type commits to the L2 data in blobs, the zkVM backends and program identity, and a hash of the proof's public values. Raw proofs travel in ephemeral sidecars, Ethereum clients verify them with a program-agnostic proof engine generalized from EIP-8025 (optional execution proofs), and recursive aggregation folds them into L1's own block proof. L2BEAT now lists this as the main alternative to EIP-8288.
3. **Proof dependencies through frame transactions ([EIP-8288](https://eips.ethereum.org/EIPS/eip-8288), merged as a Draft in September 2026), the current direction.** An EIP-8141 frame transaction carries the L2 block data in blobs and declares its proof as a dependency. Proofs never enter the L1 block: mempool nodes and the builder aggregate them recursively into one proof per block, which validators verify. The rollup contract checks the proven program against the EIP-8357 verification key registry, then advances its state root. L2BEAT's Native Rollups Book adopted this as the proof path for native rollups.

What a native rollup can customize (EIP-8079, L2BEAT): sequencing policy, settlement and governance configuration, gas token, and fee collection. What it cannot: EIP-8079 states native rollups "do not support custom opcodes, custom precompiles or custom transaction types" inside the state transition function. Execution is L1's EVM. Through EIP-8357 the rollup either follows L1's EVM upgrades without its own upgrade or governance vote, or pins a historical EVM version (section 4). L2BEAT lists "native rollups with extensions" as planned research, which Arbitrum and Optimism have shown interest in: a rollup that follows L1's EVM through the registry and maintains only its own precompiles, opcodes, or transaction types. Bitsocial's plain-EVM strategy does not depend on it.

Related work: a FOCIL-based forced-transaction inbox (ethresear.ch, June 2026; prototype in `l2beat/native-rollups` PR #4) lets users bypass the sequencer by submitting signed L2 transactions to an L1 inbox that the rollup must include.

Authorship note: Luca Donno (L2BEAT) co-authored EIP-8079, wrote EIP-8357, announced nativerollups.fyi, and maintains GNS (section 6). The native rollup path and the `.gwei` fork path both lead back to the same researcher's work. That is useful for coordination, and a concentration to keep in mind.

## 2. Status (updated 2026-10-26)

### nativerollups.fyi: what is real and what is mocked

The explorer runs a native rollup on a local copy of `bogota-devnet-1` (Nethermind, Reth, and ethrex); the 2026-10-05 capture ran on `frames-devnet-0`. On 2026-10-26 it showed about 780K L2 transactions, 4-second blocks, deposits and withdrawals, ERC-20 bridging, and Uniswap swaps. Its own table:

| Part | Status |
|---|---|
| L1 with frame transactions and blobs | Real (local devnet copy) |
| L2 execution (execution-specs Bogota rules, frame transactions included) | Real |
| Stateless validation program | Real, but run as ordinary code, not inside a zkVM (written for Amsterdam, ported to the Bogota rules) |
| Block data in blobs (EIP-8142 encoding) | Real |
| Rollup contract, L2 messenger, message proofs | Real |
| Independent follower that rebuilds the L2 from L1 data alone | Real |
| Proof | **Mock**: a trusted key signs blocks the real program accepted |
| Proof check on L1 (EIP-8288) | **Mock**: a contract checks the signature |
| Verification key registry (EIP-8357) | Real contract at the EIP's address, entry set in the L1 genesis as the activating fork would; the key hash is a placeholder because the proofs are signatures (was **mock** on 2026-10-05) |
| Blob check in the program (EIP-8142) | **Mock**: the node checks it instead |

Permissions in the demo: the rollup contract has no owner. Only the sequencer adds blocks, "or anyone once it has posted none for two hours." Preconfirmations are backed by a bond that anyone can slash by showing a broken signature. The key registry has no owner; only a later L1 fork could change its entry.

### L1 dependencies

| Item | What it is | Status |
|---|---|---|
| EIP-8079 | Native rollups via EXECUTE | Draft |
| EIP-8025 | Optional execution proofs (consensus-layer proof infrastructure) | Draft; **declined for Hegotá** on 2026-10-15 per the Native Rollups Book status page (l2beat.com/native-rollups still says proposed). EIP-8357 lists it as a requirement |
| EIP-8142 | Block-in-Blobs: execution-payload data published in blobs | Draft; **declined for Hegotá**. Native rollups need it in a later fork or another way to bind L2 data |
| EIP-8288 | In-mempool signature and STARK aggregation through an EIP-8141 frame mode; dependencies are folded into one recursive block-level STARK (Buterin, Coratger; created 2026-06-03) | Draft (merged September 2026, last updated 2026-10-15). Open questions on mempool proving costs and how the aggregate enters the block proof; it does not yet define LeanSTARK dependencies for arbitrary programs |
| EIP-8357 | EVM verification key registry: a system contract with the canonical EVM verification key hash per L1 fork; requires EIP-8288 among others | Draft, merged 2026-10-14 (PR #12055); not in any client or fork |
| Mandatory execution proofs, leanVM | One L1 block proof that validators verify instead of re-executing, which also covers rollup proofs; the zkVM shared by L1 and EIP-8288 (moving to RISC-V) | Expected in K* at the earliest under the current strawmap |
| EIP-7805 (FOCIL), EIP-8141 (Frame transactions) | Fork-choice enforced inclusion lists; programmable transaction validation and gas payment | **Scheduled for Hegotá**, the fork's only two must-ship items |
| Proof-carrying transactions | The transaction type for native proof verification | Research proposal, no EIP; now the main alternative to EIP-8288 |

L2BEAT's roadmap no longer carries dates for upcoming work: "What comes next depends on L1, so it has no dates." The 2026-10-05 snapshot cited targets of December 2026 for a native proof verification EIP and devnet and June 2027 for proof aggregation; those dates are gone. Done since then: EIP-8288 adopted as the proof path, the specification rebased on Glamsterdam and Hegotá, EIP-8357 merged as a Draft, and the rollup contract running on a live devnet. Planned, undated: LeanSTARK dependencies in EIP-8288, EIP-8357 in clients and proposed for a fork together with EIP-8288, the L1 block proof absorbing the EIP-8288 aggregate, a block data path now that Block-in-Blobs missed Hegotá, real zkVM proofs on the devnet, and research into native rollups with extensions. Mainnet needs a hard fork after all of that. No date exists.

## 3. Fit for Bitsocial Chain

Mapped against gaps this repo already documents:

| Gap (source) | Native rollup answer |
|---|---|
| No proof system; a lying read API is only caught by re-derivation (DESIGN.md, "What is missing" #1) | Validity proofs verified by L1 itself |
| Challenge rules and bonds (#2) | Not needed with validity proofs |
| Upgrade and exit model (#3) | Execution and verifier follow L1 forks through the EIP-8357 registry, or stay pinned to one registered EVM version (section 4); the rollup contract can be ownerless (the demo's is) |
| Real state commitments (#7) | Standard EVM state root, recorded on L1 |
| AgoraSwap's "physics" blocker: batching, DA, sequencing (ECONOMICS_DISCUSSION.md) | Blob DA, batched blocks, sequencing chosen in the rollup contract |
| Community tokens, AMMs, arbitrary contracts | Full EVM, identical to L1 |
| BSO-denominated gas with a burn (chain.bitsocial.net tokenomics) | Custom gas token over L1→L2 messaging; base fee burned or redirected |
| Anyone can verify by re-deriving from L1 (README, "What this POC proves") | Kept: an independent follower rebuilds the L2 from L1 data alone |

What it costs relative to the POC:

- **The contract-free property goes away.** The POC has no contracts anywhere; validity lives in open derivation rules. A native rollup has a rollup contract on L1, and the `.bso` registry becomes an L2 contract. Keeping both ownerless and non-upgradeable preserves "nothing to seize," but there are now artifacts to audit.
- **Inclusion guarantees depend on sequencing.** In the POC, any L1 transaction to the inbox *is* inclusion (Facet-grade; RESEARCH_AZTEC_VS_FACET.md §6). On a native rollup that holds only with based sequencing, or with a forced-transaction inbox behind a sequencer.
- **A hard dependency on Ethereum's roadmap.** Facet and Aztec run on mainnet today. Native rollups do not.
- **No custom precompiles.** Anything Bitsocial needs must be plain EVM. That is also what makes the interim strategy in section 7 work.

## 4. Decisions that remain

### Sequencing

| Option | Inclusion guarantee | Latency | No operator? |
|---|---|---|---|
| Based (L1 proposers sequence) | L1-grade | 12-second L1 slots | Yes |
| Sequencer with bonded preconfirmations and a forced-transaction inbox (the demo's model: 4-second blocks, 2-hour liveness fallback) | Forced inbox (FOCIL-based design, still research) | Fast preconfirmations | No: an operator exists, bounded by its bond and forced inclusion |
| Staked sequencer set | Honest minority plus forced inbox | Depends on the set | Partially |

This is ECONOMICS_DISCUSSION.md open question 7: what block cadence the smart liquidity layer needs, and whether that cadence is compatible with staying based and Stage 2. It should be decided there, together with AgoraSwap's mechanism choice. Per-block batch auctions tolerate 12-second based blocks far better than continuous AMMs do.

### Following or pinning L1's EVM (EIP-8357)

EIP-8357 (Draft, merged 2026-10-14) adds an L1 system contract at a fixed address. Each entry maps the verification key hash of one fork's EVM stateless-validation program to the input schema that program accepts. Entries are append-only and are never deleted or overwritten. A single "current" pointer moves only when a hard fork registers a new key or reactivates an earlier one. Any contract can read the current entry or look up an exact historical one, so a native rollup contract can:

- **Follow** the current entry. The rollup inherits every L1 EVM upgrade and verifier fix with no governance of its own. The EIP's security considerations name the cost: proofs generated under the previous key may fail after the switch, and "a rollup unable to produce proofs under the new verification key may halt."
- **Pin** an exact entry. The rollup keeps a fixed EVM version. The EIP is equally direct: registered hashes "are never revoked, even if proofs under the corresponding verification keys are later considered insecure," and pinning consumers assume that risk. A pinned chain also forgoes later opcodes, precompiles, and gas repricings.

The EIP describes pinning "while its infrastructure adapts," which implies a rollup that can later switch modes. Switching requires an upgrade path, and an upgrade path requires governance. For the ownerless, non-upgradeable rollup contract Bitsocial would need for Stage 2, the mode is chosen once at deployment.

**Recommended direction (not a decision): follow the current entry.** Inheriting Ethereum's execution and its fork process as the only upgrade authority is the main reason to prefer a native rollup over a bespoke ZK rollup (option D in section 7). Pinning trades a bounded liveness risk at L1 fork boundaries for an unbounded soundness risk that nobody can fix, and it brings back the question of who upgrades the chain. Following has two consequences to plan for:

- **Prover readiness at every L1 fork.** If no one can produce proofs under the new key at activation, the chain stops advancing until someone can. Forced inclusion does not help, because forced transactions still need a proven block. The mitigation has to be operational (prover software released and tested before each fork), not an admin key.
- **Application contracts inherit L1's EVM changes.** The `.bso` registry, community-token templates, and AgoraSwap contracts face the same exposure to EVM changes as contracts deployed on L1. Immutability stays at the application layer: each deployment is frozen, and new versions ship as new templates.

Open question: can an ownerless rollup contract bound the fork-boundary halt without governance, for example by accepting proofs under the previously current key for a fixed window after it first observes a new current entry? The registry exposes the current entry and exact lookups but no activation time or "previous" pointer, so the contract would have to track that itself. Whether proving L2 blocks under the old EVM rules after L1 has moved is acceptable is unresolved.

## 5. Privacy

Unchanged from RESEARCH_AZTEC_VS_FACET.md. A native rollup is a transparent EVM. App-level Noir verifiers (option C there) can be deployed as ordinary Solidity contracts, at ordinary gas cost since custom precompiles are not allowed. The shielded-value lane still points to Aztec or a similar external system. DESIGN.md's privacy-compatibility requirements apply to any GNS fork as written; in particular, clients should not default to publishing a permanent payment address in the public registry.

## 6. Forking .gwei (GNS) for .bso

[GNS](https://github.com/lucadonnoh/gwei-names) describes itself as "an ownerless, neutral fork of wei-names." It is live and verified on Ethereum mainnet and Sepolia, written in Solidity, and MIT-licensed (compatible with this repo's GPL-3.0-or-later). The first commit was 2026-06-26.

Properties that match Bitsocial's requirements:

- **No owner, no admin, no upgrade path.** There is no constructor, and every fee parameter is a `constant`. The `GnsIntegrationVoting` contract only orders the integration cards on the gwei.domains website; it is itself ownerless and stateless and has no power over names.
- **Fixed length-based fees, burned.** 0.5 / 0.1 / 0.05 / 0.01 ETH for 1–4 byte labels and 0.0005 ETH for 5 or more. Renewal costs the same. Paid ETH stays locked in the contract with no `withdraw()`.
- **Expiry with a 90-day grace period**, then a Dutch-auction anti-snipe premium that starts at 100 ETH and decays to 0 over 21 days, also burned. Anyone can renew any name.
- **Commit-reveal registration.** Front-running protection matters once a sequencer can see pending registrations.
- **An ENS-compatible resolver in the same contract**: multi-coin addresses, text records, contenthash (IPFS, IPNS, Swarm), and reverse resolution, plus a universal resolver, a TypeScript SDK (`gns-utils`), a MetaMask Snap, and a gateway.
- **Free subdomains** controlled by the parent, with epoch-based invalidation when the parent reclaims.
- **`HumanRegistrar`**: free `.id.gwei` names for ZKPassport-verified humans. This is a possible model for free or discounted `.bso` names behind a personhood proof.

What a `.bso` fork would change:

- **TLD**: `.gwei` → `.bso`.
- **Fee asset**: GNS charges `msg.value` in the chain's native token. On a native rollup with BSO as the gas token, the same code would charge and lock native BSO, which matches the burn-centric tokenomics. On a chain where BSO is an ERC-20, the fee path needs rewriting. Either way, fee levels need re-deriving in BSO terms, and immutable constants in a volatile asset can drift toward trivially cheap (squatting) or prohibitive.
- **Records**: the `bitsocial` text record the BSO Resolver reads from ENS today would be read from the fork's contract on the L2 instead.
- **Migration**: current `.bso` names are `.eth` aliases resolved through ENS (DESIGN.md). A native registry needs a claim or migration policy for existing holders. gwei.domains lists an "ENS to GNS Migrator" integration worth studying.

What it changes relative to this POC's SPEC.md:

| | POC (SPEC.md) | GNS fork |
|---|---|---|
| Ownership | Permanent | Expiring, renewable by anyone |
| Revocation | Permanent tombstone | Expiry, grace period, premium auction, re-registration |
| Registration | First valid L1 intent wins | Commit-reveal, fee plus any premium |
| Pricing | None (L1 gas only) | Fixed length-based, burned |
| Labels | Conservative ASCII subset, max 63 bytes, single label | UTF-8, 1–255 bytes, on-chain ASCII lowercasing only; free subdomains |
| Contract surface | None | ERC-721, registrar, and resolver in one non-upgradeable contract |
| Record payload | `publicKey` and `metadataUri` | ENS-style records (text, contenthash, addresses) |

The label rules are the largest semantic change. GNS performs no Unicode normalization, confusable detection, or script restriction on-chain; its README delegates this to clients through ENSIP-15. The POC avoided Unicode on purpose to sidestep homograph attacks. A fork either restricts labels on-chain (a code change) or requires every Bitsocial client to normalize with ENSIP-15.

Audit: the repo's `audit/` folder holds upstream wei-names audit notes (per its initial commit). The README lists no GNS-specific audit.

## 7. Options

**A. Native rollup as the target, a GNS fork for names, plain EVM in the meantime. (Recommended direction, not a decision.)**
Native rollups forbid custom precompiles, so anything that will eventually run on one is plain EVM and runs on any EVM chain today. Build and test the `.bso` GNS fork, and later the community-token and AgoraSwap contracts, as portable EVM contracts. Choose the chain once the native rollup proof path (EIP-8288 with EIP-8357) is scheduled for a named fork. This avoids both waiting idle and locking into an interim chain.

**B. Ship on an existing Stage 2 EVM rollup now (for example Facet) and migrate later.**
Real today, but Facet's limits (calldata DA, about $3 of L1 cost per operation, one batch per hour, a trusted fast bridge; RESEARCH_AZTEC_VS_FACET.md §3) are exactly AgoraSwap's blockers, and migrating names and balances later is costly.

**C. Keep extending the POC's L1-calldata derivation.**
Fine for names. ECONOMICS_DISCUSSION.md already concludes it cannot host competitive on-chain trading, and it has no path to proofs short of building a bespoke proof system.

**D. Build a bespoke ZK rollup now (OP-Succinct or SP1 style, as Facet did).**
Works today, but it creates the verifier-governance and upgrade burden that native rollups exist to remove.

## 8. Next steps

1. **`.bso` GNS-fork spike** on a local EVM chain (Hardhat or anvil): rename the TLD, charge fees in the native token, and resolve a `bitsocial` text record end to end through a resolver shaped like `@bitsocial/bso-resolver`. Decide label rules (ASCII-only on-chain, or ENSIP-15 in clients), fee levels, and whether fixed constants in BSO are acceptable.
2. **Sequencing decision** in ECONOMICS_DISCUSSION.md (question 7), together with AgoraSwap's mechanism choice.
3. **Follow-or-pin decision** for the rollup contract's EVM verification key (section 4), including how prover readiness at each L1 fork would be organized without an admin key.
4. **Track L1 milestones** (L2BEAT's roadmap is now undated): EIP-8288 and EIP-8357 proposed together for a named fork, EIP-8357 in clients, a block data path after Block-in-Blobs was declined for Hegotá, real zkVM proofs replacing the devnet's signed mocks, and the fork that brings mandatory execution proofs (K* at the earliest).
5. **Migration policy** for current ENS-alias `.bso` holders.

## 9. Risks and monitoring signals

- **Timeline**: no scheduled fork, L2BEAT's roadmap no longer carries dates, and mandatory execution proofs are expected in K* at the earliest. Signals: EIP-8288 and EIP-8357 proposed for a named fork, real zkVM proofs on a public devnet, and a block data path to replace Block-in-Blobs after it missed Hegotá.
- **Design churn**: the proof path has already changed twice (EXECUTE re-execution, then proof-carrying transactions, then EIP-8288 proof dependencies). Plain EVM contracts are insulated; anything that depends on the rollup-contract interface is not.
- **Fork-boundary liveness**: a rollup that follows the current EVM key can halt at an L1 fork if no prover is ready under the new key; a pinned rollup keeps a key that is never revoked. The mode is fixed at deployment, but a following rollup faces the liveness risk again at every L1 fork, while a pinned one stays tied to the key it chose.
- **Sequencer centralization**: the reference demo uses one sequencer. Adopting it unchanged would regress the POC's no-operator property.
- **Fixed fees in BSO**: immutable constants in a volatile asset.
- **Homograph exposure** if GNS label rules are adopted unchanged.
- **Young upstream**: GNS's first commit was in June 2026, and its fork base, wei-names, was owner-controlled.

## 10. Sources

- nativerollups.fyi: explorer home and About page ("What's real and what's mocked", "Contracts and permissions"), captured 2026-10-05 and again 2026-10-26; Native Rollups Book status page (`nativerollups.fyi/book/status.html`), captured 2026-10-26; @donnoh_eth announcement post describing it as "a closed devnet based on frames-devnet-0 running a (half mocked) native rollup"
- L2BEAT: `l2beat.com/native-rollups` (design overview, customization surface, roadmap, "not part of any scheduled Ethereum hard fork", "What Ethereum still needs"), captured 2026-10-05 and again 2026-10-26; L2BEAT thread on native proof verification, 2026-10-26 (`x.com/l2beat/status/2114715822820143218`)
- `eips.ethereum.org/EIPS/eip-8079` (Native rollups, Draft), `…/eip-8288` (In-mempool signature and proof aggregation, Draft), `…/eip-8142` (Block-in-Blobs, Draft), `…/eip-8025` (Optional Execution Proofs, Draft)
- EIP-8357 (EVM Verification Key Registry): merged Draft text in `ethereum/EIPs` (`EIPS/eip-8357.md`, PR #12055, merged 2026-10-14; abstract, rationale "Current and pinned verification key hashes", security considerations) and the Ethereum Magicians thread
- ethresear.ch: "Native rollups—superpowers from L1 execution" (January 2025), "Native proof verification" (May 2026), "Repurposing FOCIL as an L2 forced transaction mechanism" (June 2026)
- `github.com/lambdaclass/ethrex/pull/6186` (EIP-8079 re-execution PoC), `github.com/l2beat/native-rollups` (research repo, forced-inbox prototype)
- Hegotá scope: The Defiant, "Ethereum Foundation Sets 2029 Quantum Target and Narrows Hegotá Scope" (FOCIL and Frame Transactions as the must-ship items); later coverage confirming the same two scheduled items
- `github.com/lucadonnoh/gwei-names` README (ownership, fees, lifecycle, resolver, normalization, integration voting, deployments) and `gwei.domains`
