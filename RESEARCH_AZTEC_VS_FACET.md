# Aztec vs Facet for the Bitsocial financial layer

Research snapshot, 2026-07-20. Sources scraped via firecrawl into `../.firecrawl/` (l2beat.com, aztec.network, docs.aztec.network, facet.org, docs.facet.org, thedefiant.io, coindesk.com, github.com/vbuterin/aztec_experiments). Companion docs: [DESIGN.md](DESIGN.md), [ECONOMICS_DISCUSSION.md](ECONOMICS_DISCUSSION.md).

## TL;DR

- **Both Facet and Aztec are now L2Beat Stage 2.** Facet claims "first general-purpose Stage 2 rollup" (final red risk resolved with the May 17, 2026 rollup redeploy); Aztec followed June 21, 2026 ("Cut the Leash": governance revoked rollup ownership → immutable).
- **Aztec is the only Stage 2 L2 with protocol-native privacy.** Private execution happens client-side (proofs generated on the user's device); the network only sees commitments/nullifiers. Public execution exists too — apps choose the split per function.
- **Aztec's $31.70 TVS is structural, not just "nobody came".** Its mainnet launched Nov 2025 as *consensus-only*; smart contracts arrived with the "Alpha" launch on Mar 31, 2026 (v5 canonical July 13 — one week old; Aztec still officially labels mainnet **Alpha**, v5.0.1: "bugs (including critical ones) are expected"). And there is no general canonical bridge: each app deploys its own L1 "portal", which L2Beat doesn't count. The only tracked escrow is the one-way AZTEC gas portal.
- **Facet is also near-empty** ($494K TVS, <0.01 daily UOPS, one L1 batch/hour), and 99.9% of its TVS carries extra trust assumptions (the `FacetEtherBridgeV6` fast bridge is operated by a permissioned EOA). Neither chain is a bandwagon; both are values-aligned infrastructure bets.
- **Vitalik Buterin is actively prototyping bitsocial's exact problem space on Aztec** (`vbuterin/aztec_experiments`, last commit July 19, 2026): an anonymous message board with deposit-scaled rate-limiting, an on-chain moderation policy, hide-don't-delete censorship, and a local-LLM auto-moderator — plus 70 Lean 4 theorems over its security properties.
- **Recommendation:** don't move bitsocial-chain's inbox/derivation layer anywhere — its Facet-style L1-calldata design keeps the strongest inclusion guarantee and sovereignty. Treat **Aztec as the leading candidate for the private-payments lane** (private BSO tips via a portal), and **Noir as the ZK toolchain to adopt either way**. Concrete next step: a small spike porting the Billboard portal pattern to BSO.

---

## 1. What Aztec actually is

A privacy-preserving ZK rollup on Ethereum (L2Beat type: ZK Rollup; purposes: *Universal, Privacy* — that's what "universal L2" means: general-purpose, not app-specific). Chain ID 677868. Gas token AZTEC. DA: Ethereum blobs (state diffs published on L1).

**The two-halves transaction model** (from Aztec's "Inside an Aztec Transaction"):

- **Private half — runs on your device.** Contracts written in **Noir** ("Rust for ZK"). Private state is UTXO-like encrypted **notes**; spending emits **nullifiers**. The wallet's PXE (Private Execution Environment) executes locally and produces a zk proof; raw data never leaves the device. The network verifies the proof without seeing sender, amounts, or logic inputs.
- **Public half — runs on the network.** The AztecVM (AVM) executes public functions like a normal chain; public state is a normal tree. One transaction can carry both halves (canonical example: a private vote that updates a public tally).
- **Portals**: any L1 contract can be a bridge endpoint for an Aztec contract via the protocol's Inbox/Outbox message trees. There is deliberately no single canonical asset bridge — bridging is per-app. L2→L1 messages finalize with the epoch proof (~40 min in practice).
- **Fees**: gas ("mana") is paid in "Fee Juice" — bridged AZTEC that is **non-transferable on L2** (only spendable on fees; the L1 gas portal is one-way, no user withdrawals). EIP-1559-style base/priority fees. **Fee-paying contracts (FPCs)** are protocol-native paymasters: an app can sponsor fees or charge them in any token (setup/teardown phases exist specifically for this), and a brand-new account can claim bridged Fee Juice and pay for its own deployment in one transaction. Caveat: the built-in Sponsored FPC works on testnet/devnet only; **on mainnet alpha the reference FPC doesn't function** (custom token class IDs aren't in the default public-setup allowlist) — ecosystem FPCs are the practical path today, e.g. Nethermind's Private Multi Asset FPC (`NethermindEth/aztec-fpc`).
- **Noir + Barretenberg are chain-agnostic**: Noir compiles circuits provable with Barretenberg (UltraHonk) in-browser via bb.js, with generated Solidity verifiers for any EVM chain. ZKPassport, ZKEmail, StealthNote, TACEO are Noir projects; Aztec Labs acquired ZKPassport (June 2026).

## 2. Aztec status (as of 2026-07-20)

Timeline:

| Date | Event |
|---|---|
| Nov 2025 (Coindesk: Nov 20) | **Ignition Chain** mainnet — consensus layer only, decentralized from day 1 (Labs/Foundation run zero sequencers) |
| Jan 26 → ~Feb 11, 2026 | TGE governance proposal passed → AZTEC tradable, Uniswap pool unlocked |
| Mar 31, 2026 | **"Alpha" launch** — private smart-contract execution live on mainnet (v4), shipped with *disclosed* known vulnerabilities |
| Jun 21, 2026 | **"Cut the Leash"**: governance revokes v4 Rollup ownership → **Stage 2** (immutable, walkaway test passes) |
| Jul 13, 2026 | **v5 canonical** via governance — hardens immutability, fixes the disclosed v4 vulnerabilities |
| Today | Mainnet officially **Alpha**, v5.0.1 (testnet runs the same version); docs: "bugs (including critical ones) are expected", hardening path "to Beta". Docs' own advice: "Testnet is your production path" |

Network (Aztec's own Ignition update + L2Beat):

- 185+ operators, **3,400+ staked sequencers**, 50+ provers, 5 continents; 99%+ attestation rate. Validator specs are solo-staker-friendly (8 cores / 16 GB / 1 TB / 25 Mbps). Min stake 200K AZTEC (~$2.6K at current price), delegation supported, no fractional staking.
- Sequencing: permissionless stake → queue → pseudo-random committees. **Escape hatch**: anyone bonding 332M AZTEC (~$4.3M) joins a fallback candidate set; every ~2d23h one candidate may propose+prove fully autonomously. Bond slashed 9.6M AZTEC on failure. Censorship condition per L2Beat: "users can be censored if no honest regular proposer or eligible bonded escape-hatch proposer includes and proves their transactions" — i.e. **no direct L1 self-sequencing** (see §6).
- Governance: "Empire" signaling by slot proposers (1000-slot rounds, 600 signals to win) → L1 token voting; emergency path requires locking 258M AZTEC for 3 months. Each deployed rollup version is immutable; upgrades happen by deploying a new version that stakers/users opt into (that's how v4→v5 worked). A 5/9 SlashVeto Council exists but only over slashing payloads, not the rollup.
- Numbers: TVS **$31.70** (100% canonical — the gas portal; 0.00% extra trust assumptions). UOPS: no data tracked yet. Liveness: tx-data batches ~every 1 min, state updates ~3 min, 100% uptime over 30d, ~$2.5K/day in L1 costs. So the chain runs continuously; user demand is just embryonic.
- Token: ERC-20 on L1 (`0xa27ec0006e59f245217ff08cd52a7e8b169e62d2`). **Genesis supply 10.35B — not a hard cap**: year-1 rewards were pre-minted (250M ≈ 2.41%), and governance can mint further network rewards up to a **20%-of-supply cap** (the tokenomics paper models ~1.8–3% effective annual inflation, with fees intended to overtake issuance as operator revenue). ~2.9B circulating; ~$0.013 → **mcap ~$37M**, FDV ~$135M. Listed on Coinbase, Kraken, Upbit, Bybit, Gate, KuCoin, Uniswap, Hyperliquid, etc. Uses: staking, governance, gas, emissions (70% sequencers / 30% provers per 32-block epoch; 30M+ distributed so far).
- Incident hygiene: the June 2026 ~$2.1M drain hit a long-deprecated **Aztec Connect** contract (the pre-2023 product) — a separate codebase from the current rollup.

## 3. Facet status refresh

Facet turns out to be much further along the proof path than when we last looked:

- **L2Beat lists Facet as Stage 2** — "first general-purpose Stage 2 Ethereum rollup" per their announcement. It's now described as "a based rollup built on OP-Succinct". Chain ID 1027303. DA: L1 **calldata** (not blobs).
- **Proof system (since Jul 1, 2025; redeployed May 17, 2026)**: hybrid ZK fault proofs via SP1. Whitelisted proposer (currently one address) posts state roots optimistically with a 0.005 ETH bond; anyone can challenge (10 ETH bond) forcing a ZK proof within 7d; **anyone can propose with a validity proof at any time**; anyone can propose optimistically for blocks older than 14d. The May 2026 redeploy locked the SP1VerifierGateway to a single Plonk verifier and renounced ownership — resolving the trusted-setup red flag. (Fun detail: that verifier's trusted setup is Aztec's 2019 *Ignition* ceremony.)
- **Risk rosette all green**: Self-sequence (send your tx on L1 to inbox EOA `0xface7` — no privileged operator), fraud proofs (1R, ZK), on-chain DA, **exit window ∞** (nothing is upgradeable), self-propose.
- **No canonical bridge, by philosophy**: FCT gas is *mined* by burning L1 ETH gas (dynamic mint rate, fct.fyi), so no bridge is needed to buy blockspace, so no admin controls need to exist anywhere. Their "thin platform" / "Unstoppable Rollups" argument: Stage 2's 30-day exit window still under-protects users; Facet removes the upgrade lever entirely. This is philosophically identical to bitsocial-chain's inbox design (no L1 artifact to capture).
- **Reality check**: TVS $494K, of which **99.9% carries additional trust assumptions** — in practice value sits in `FacetEtherBridgeV6`, a fast ETH bridge whose withdrawals are processed by a permissioned EOA, independent of the proof system. The trust-minimized path (bridges reading `Rollup` state roots) exists as tooling but is barely used; the legacy trustless `L1Bridge` is dead (bound to the deprecated rollup, no canonical replacement selected). Activity: **19 ops in the past day** (<0.01 UOPS; 124.8K ops total since Dec 2024), one tx-data batch/hour, state updates every 6h, and an average **$3.02 of L1 cost per operation** — calldata pricing is cheap in aggregate (~$300/day) but expensive per op, and it's the same cost class as bitsocial-chain's own L1-calldata intents. (Aztec, by contrast, pays a usage-independent ~$2.5K/day for its blob/proof cadence.) Ecosystem: FacetSwap, FacetNFT, FacetNames. Funded via an LLC + Giveth donations — minimal team, but the design intentionally requires no ongoing team.

## 4. What "Stage 2" does and doesn't mean

L2Beat's stages measure *rollup training wheels*: proof system live and permissionless, contracts immutable (or exit-windowed), users can exit without operators ("walkaway test"). They explicitly say stages are a maturity framework, not a security score. Aztec is unusual in *also* having decentralized block production (most Stage 2 talk is about proofs/upgradability, with a centralized sequencer still humming along — e.g. Fuel). Facet sidesteps sequencing entirely (based = L1 is the sequencer). So "Stage 2 (decentralized)" is roughly right for both, but for different reasons: Facet = nothing to decentralize; Aztec = actual PoS sequencer set + bonded escape hatch.

## 5. Head-to-head

| | **Facet** | **Aztec** |
|---|---|---|
| Type | Based rollup, OP-Succinct (optimistic + ZK fault proofs) | ZK rollup, validity proofs |
| VM / language | EVM / Solidity | AztecVM / **Noir** (private + public functions) |
| Privacy | None (fully transparent EVM) | **Native**: client-side proving, encrypted notes, selective disclosure |
| Sequencing | None — self-sequence on L1 (`0xface7`) | PoS committee (200K AZTEC stake) + 332M-bond escape hatch |
| Inclusion guarantee | **Strongest possible**: any L1 tx is inclusion | Weaker: need an honest committee member or bonded fallback proposer |
| Content-censorship surface | Full (everything visible to everyone) | **Near-zero for private txs** (sequencers can't see what they'd censor) |
| DA | L1 calldata | L1 blobs |
| Gas token | FCT, mined by burning L1 gas (fair-launch, no bridge needed) | AZTEC (VC/token-sale history), one-way gas portal, **FPC paymasters** |
| Canonical bridge | None by design; bridges are apps (today: trusted EOA fast bridge) | None general; per-app portals with proof-backed L1↔L2 messaging |
| Upgradability | None, ever (exit window ∞) | Per-version immutable; new versions via token/sequencer governance |
| Stage 2 since | ~May 2026 (final red risk resolved; claims "first general-purpose") | Jun 21, 2026 |
| Scale today | $494K TVS (99.9% trusted path), <0.01 UOPS | **$31.70** TVS, UOPS untracked, blocks ~1/min |
| Team/resources | Minimal (LLC, donations); design needs no team | Aztec Labs + Foundation, 8 yrs R&D, ~$100M raised, live token economy |
| Ethos fit | Extremely bitsocial-like: immutable, thin, no-admin, fair-launch | Privacy-maximalist; governance+token layer is more "protocol politics" |
| L1 settlement latency | Optimistic window (7d challenge) unless ZK-proven earlier | Epoch proof ~40 min |

## 6. Censorship resistance, analyzed for bitsocial specifically

Two different CR properties matter, and the chains split them:

1. **Inclusion CR** (can anyone stop my transaction from entering the chain?) — Facet wins outright: posting to an inbox EOA from any L1 address *is* sequencing; the censor would have to censor Ethereum itself. Aztec inherits only economic guarantees (honest-minority committee + a $4M-bonded fallback that rotates every ~3 days). **bitsocial-chain's current inbox design already has Facet-grade inclusion CR** — that's worth preserving for the registry/intent layer.
2. **Content-blindness CR** (can anyone censor *selectively* based on what my transaction does or who I am?) — Aztec wins outright. On any transparent chain (L1, Facet, our derived appchain), "drop every tx touching the bitsocial tipping contract" is a trivially implementable policy for a sequencer, a relayer, or a jurisdiction. On Aztec, a private tx reveals nothing to discriminate on; censorship degrades to all-or-nothing, which is exactly the failure mode the escape hatch and L1 governance pressure are designed for.

For the social graph, the user-compromise argument is concrete: transparent tips/payments publish *who funds whom, when, how much* — a follow-graph and income map for every pseudonymous author, one address-linkage away from deanonymization. Privacy-as-option in the financial layer is therefore not a luxury feature; it's what keeps the *social* layer's censorship resistance from leaking away through the money.

Corollary: the two chains' strengths are complementary, and they map onto bitsocial-chain's existing split (DESIGN.md): **registry/intents want inclusion CR → stay L1-calldata (Facet-style); value movement wants content-blindness → Aztec-style lane.**

One caveat that cuts against rushing: **cryptographic privacy ≠ practical anonymity on an empty chain.** With today's user counts, timing and amount correlation can shrink an anonymity set no matter how good the proofs are. Billboard's own `SECURITY_PROPERTIES.md` is explicit about the residuals: L1 deposits/withdrawals are public bookends, the anonymity set is only "depositors who haven't withdrawn", and posting-time *patterns* remain observable even though post contents carry no sender or traceable metadata. Privacy quality will track adoption — design for it (batching, wide pools, decoy timing) rather than assuming it.

## 7. Vitalik's Billboard (`vbuterin/aztec_experiments`)

Active repo (5 commits, latest Jul 19, 2026): an anonymous message board on Aztec v5 mainnet. Flow: deposit ETH into an L1 portal → claim a private DepositNote on L2 → post anonymously (no sender in public calldata, no link to the deposit) → withdraw to L1 (~40 min epoch proof). Anonymity set = all depositors who haven't withdrawn.

Directly relevant mechanisms:

- **Deposit-scaled rate limiting**: `cooldown = base_cooldown × min_deposit / amount` — spam resistance priced in stake, no identity required, with a "save-up" allowance for burstiness. A privacy-preserving cousin of bitsocial's challenge/karma anti-spam toolbox.
- **Censorship that's honest about being censorship**: a designated censor flags posts "immoral"; flagged posts are **hidden by default but viewable** behind a confirmation click (5chan's hide-don't-delete philosophy, verbatim), and impose a time-lock penalty on the poster's *next* post via a clever Merkle-proof screening chain that never breaks anonymity.
- **On-chain moderation policy** (≤1488 bytes of text) as the single source of truth, displayed in UIs, and consumed by…
- **An automated LLM moderator**: a local llama.cpp daemon (Qwen3.5-2B) reads the on-chain policy, evaluates posts, flags violations on-chain. Transparent-policy AI moderation — the same shape as 5chan's AI moderation work, but with the policy consensus-anchored.
- **Formal verification**: 70 Lean 4 theorems over rate limits, censorship screening, privacy, and deposit safety — including "a post does not leak the sender's Aztec address" and "no metadata enables tracing across posts", with the residual leaks (timing patterns, public L1 bookends, anonymity-set size) documented rather than hand-waved.
- **DX reality check**: the browser PXE is a **~58MB WASM bundle**; `aztec-nr` must be version-pinned to the exact bundle version (v5.0.0) or baked-in contract addresses mismatch; account self-deployment needed an "initializerless" Schnorr workaround; withdrawals wait ~40 min for the epoch proof. Usable, but unmistakably alpha tooling.

Read this repo as a **reference implementation for a private bitsocial payments/posting primitive**: the portal pattern, note lifecycle, fee-juice bootstrapping (it even auto-swaps ETH→AZTEC on Uniswap v3), and the moderation mechanics are all directly transplantable. It also proves the developer experience is *usable today* — Vitalik shipped this against week-old v5.

## 8. Options for bitsocial-chain

**A. Hybrid — keep the inbox chain, add an Aztec private-value lane. (Recommended direction)**
Keep `.bso` names/intents on the L1-calldata design (sovereignty + max inclusion CR + zero dependencies). For payments/tips (currently "settle on L1 or a real L2" per DESIGN.md future work), build a **BSO portal into Aztec**: BSO is an immutable L1 ERC-20, so a `BSOPortal.sol` + Noir `PrivateBSO` contract (Billboard's TokenPortal pattern) yields shielded BSO — private tips with selective disclosure (viewing keys / public half) for creators who *want* public tip totals. Anonymity set = all bridged BSO. Fee UX solved with a bitsocial FPC that sponsors fees or charges in BSO — users never touch AZTEC (study `NethermindEth/aztec-fpc`; note the mainnet-alpha allowlist wrinkle in §1). **Privacy hygiene**: do *not* write a permanent Aztec payment address into the public `.bso` registry — a static address is a linkability anchor. Deliver fresh payment endpoints through the resolved P2P identity instead (the registry resolves the identity; the identity serves rotating endpoints).

**A′. Anonymous post permits — the standout bitsocial-specific idea (credit: the GPT-5.6 review of this doc).** Don't put posts on Aztec; put *eligibility* there, and leave posts on IPFS/libp2p where they belong. Private BSO stake on Aztec → a contract issues one-use, nullifier-based posting capabilities on a cooldown (Billboard's rate-limit note, generalized) → the proof rides along with a normal P2P bitsocial post → subplebbit owners verify it like any other challenge answer, learning nothing about wallet, balance, or social graph. This slots into the existing challenge framework as a new challenge type (BSIP material, Application/Appchain categories), and the same primitive then yields private tips, secret ballots with public tallies, and confidential creator payouts. It connects financial sybil-resistance to speech without publishing anyone's financial identity.
Costs/risks: a young chain in the loop for payments (per-version immutability helps: a v5 contract keeps running even if governance goes weird), Noir learning curve, AZTEC-denominated fee market.

**B. Move the whole financial layer onto Aztec as Noir contracts.**
Maximum privacy and real shared security, but violates the same principle that made us reject building on Facet tooling (DESIGN.md alternative C: don't move into another project's appchain before choosing to). Too early; revisit only if the hybrid lane succeeds and the inbox layer's economics genuinely need shared liquidity there.

**C. Noir without Aztec (own-appchain privacy, later).**
Noir/Barretenberg generate Solidity verifiers and prove in-browser (bb.js) — so a future graduated bitsocial appchain (Facet-style, EVM) could embed app-specific privacy: private challenge proofs, anonymous mod actions, karma-threshold proofs, and notably **zkPassport-style age proofs** (relevant to the deferred age-gate work) without any Aztec dependency. Building a full shielded *money* pool solo, though, is serious cryptographic infrastructure (note discovery, nullifier safety, audits) — that's the part worth outsourcing to Aztec rather than rebuilding.

**D. Pure wait-and-see.**
Defensible given both chains' emptiness, but it leaves the privacy question unanswered while the economics debate (ECONOMICS_DISCUSSION.md, AgoraSwap's "BSO-to-L2 path" gate) needs an answer to *which L2*. A spike now is cheap and informs that gate. Note for AgoraSwap specifically: an Aztec deployment would make it a *private* DEX — a differentiator no Facet/EVM deployment can offer.

**Proposed gating rule** (this research and the GPT-5.6 review converged on it independently; the decision belongs in [ECONOMICS_DISCUSSION.md](ECONOMICS_DISCUSSION.md)): public `.bso` names can ship unshielded — they're deliberately public ownership records — but real financial/social-graph features (tips, balances, memberships, votes) shouldn't launch without a first-class private path. "External privacy systems later" is now an unnecessarily passive posture given that a Stage 2 privacy substrate exists.

**Suggested spike (small, non-committal, testnet only — "Testnet is your production path" per Aztec's own docs):** sandbox → port Billboard's portal to a mock BSO ERC-20 → private transfer between two PXE wallets → selective disclosure → generalize the rate-limit note into a one-use **post permit** verified by a mock bitsocial challenge → FPC experiment charging fees in BSO → measure client-side proving times on normal hardware and mobile-class devices. Exit criteria: proving UX acceptable? portal/messaging DX sane? permit-proof verification cheap enough for subplebbit owners? If yes, write the BSIP for the private lane (keep real value on testnet until post-Alpha maturity, audits, and a real anonymity set).

## 9. Risks & monitoring signals

- **Aztec adoption risk**: $31.70 TVS and untracked UOPS mean no ecosystem gravity yet. Watch: TVS/portal growth, UOPS once tracked, wallet maturity (PXE in consumer wallets), whether DeFi (private DEX/stables) arrives.
- **Governance/token risk**: $37M mcap secures governance signaling; watch for contentious upgrades, the SlashVeto Council's behavior, and whether v-migrations stay clean. Mitigant: deployed versions are immutable — a lane on v5 can't be rugged, only orphaned.
- **Regulatory risk**: privacy L2s sit in a hostile spotlight; Aztec's selective-disclosure story and policy principles are the counterweight. Facet has no such exposure (and no privacy).
- **Facet longevity**: near-zero usage and a donations-funded team; the chain is designed to outlive its team, but tooling/explorer bitrot is a real operational risk for anyone building on it. Watch: proposer liveness (currently 1 whitelisted address + fallbacks), fast-bridge trust concentration.
- **Alpha software risk**: Aztec itself says mainnet bugs "including critical ones" are expected (v4 shipped with disclosed vulnerabilities; v5 fixed them one week ago). Real value has no business there yet — testnet-first is the vendor's own advice.
- **Tooling/DX risk**: ~58MB PXE bundle, strict version pinning across the monorepo stack (node/Aztec.nr/aztec.js must match), reference FPC non-functional on mainnet alpha, rough logging — expect breakage across version migrations.
- **Anonymity bootstrap**: privacy features shipped before the pool has users can be worse than none (a small anonymity set gives false confidence). Sequence launches so the shielded pool has depth before it's marketed as protection.
- **Perf unknowns to measure in the spike**: client-side proving time per tx class; epoch (~40 min) UX for withdrawals; fee volatility in AZTEC terms; FPC sponsorship costs.

## 10. Sources

- L2Beat: `l2beat.com/scaling/projects/aztecnetwork` (Stage 2, $31.70 TVS, risk/sequencing/governance detail), `…/projects/facet` (Stage 2, $494K TVS, proof system, bridge caveat), TVS breakdowns
- Aztec: `aztec.network/blog/aztec-ignition-chain-update` (network stats), `aztec.network/token`, `aztec.network/noir`, `docs.aztec.network` (transactions/PXE/fees-FPC), "Inside an Aztec Transaction" (Jun 30, 2026)
- The Defiant (Jun 22, 2026): Aztec Stage 2 after governance revokes rollup ownership; Aztec Connect legacy exploit note; ZKPassport acquisition
- Coindesk (Nov 20, 2025): Ignition Chain launch
- Facet: `facet.org/stage-2-announcement`, `docs.facet.org` (architecture, ZK fault proofs, FCT issuance)
- `github.com/vbuterin/aztec_experiments` (Billboard README, censor-daemon, fv/, `SECURITY_PROPERTIES.md` — verified P1–P9 + residual-leakage caveats)
- Aztec Alpha status: `aztec.network/blog/announcing-the-alpha-network` (Mar 31, 2026), `docs.aztec.network/networks` (Alpha/v5.0.1, "bugs including critical ones are expected", "Testnet is your production path")
- Aztec Token Economics paper (genesis supply 10.35B, Y1 pre-mint 250M, 20%-of-supply governance mint cap, ~1.8–3% modeled inflation)
- `docs.aztec.network/developers/docs/foundational-topics/fees` (mana, Fee Juice non-transferable/one-way, FPCs, mainnet-alpha FPC allowlist caveat), `github.com/NethermindEth/aztec-fpc`
- Market data: Coinbase price page (AZTEC $0.013, mcap $37.5M, circ. 2.9B)
- GPT-5.6 (Codex) review, 2026-07-20: contributed the post-permit architecture, fresh-payment-endpoints hygiene, and the launch-gating rule; its factual claims (Alpha date, v5.0.1, 20% mint cap, non-transferable Fee Juice, 58MB PXE, Facet 19 ops/$3.02) were independently verified against primary sources
