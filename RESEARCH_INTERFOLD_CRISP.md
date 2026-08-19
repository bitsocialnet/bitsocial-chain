# The Interfold (ex-Enclave) / CRISP for Bitsocial: threshold-FHE votes and sealed bids

Research snapshot, 2026-08-19. Trigger: Vitalik Buterin's August 2026 endorsement calling the Interfold "what I've been yelling at people to build with the MACI ideas for almost a decade… in a generalized form." Sources scraped via firecrawl into `../.firecrawl/` (theinterfold.com, docs.theinterfold.com, blog.theinterfold.com, github.com/theinterfold/interfold). Companion docs: [DESIGN.md](DESIGN.md), [ECONOMICS_DISCUSSION.md](ECONOMICS_DISCUSSION.md), [RESEARCH_AZTEC_VS_FACET.md](RESEARCH_AZTEC_VS_FACET.md).

## TL;DR

- **The Interfold is Gnosis Guild's Enclave, rebranded** (repo moved to `theinterfold/interfold`; LGPLv3). It coordinates **E3s** (Encrypted Execution Environments): a staked committee threshold-generates a BFV FHE key; participants post encrypted inputs onchain with Noir ZK proofs of eligibility and correct encryption; a compute provider runs the program over ciphertexts (RISC Zero zkVM for verifiable additive tallies); the committee threshold-decrypts only the aggregate. **CRISP** is the reference app: receipt-free secret-ballot voting with a vote-masking OR-proof.
- **It is launch-week software.** FOLD TGE is literally today (Aug 19, 2026): Auction 2 closed 13:06 UTC, `tge()` callable from 14:00 UTC. Mainnet contracts are deployed but bootstrap with **mock verifiers** ("public-network rehearsal — replace before production CRISP workloads") and E3 requests can sit paused during operator onboarding; the Sepolia deployment **doesn't verify proofs at all**. Real DKG/decryption aggregator verifiers exist in the repo but aren't live anywhere public yet.
- **Vitalik's security summary holds up against the docs**: anonymity can be unconditional when eligibility is proven in ZK; censorship resistance inherits Ethereum (CRISP's relayer server is bypassable — votes post directly onchain); tally correctness is ZK-over-FHE; **privacy, liveness, and coercion resistance rest on M-of-N committee honesty**. And ZK-over-FHE is **additive-only today** — comparisons/sorting (auction clearing) fall back to optimistic/oracle compute providers.
- **For Bitsocial this is a mechanism-layer find, not a protocol change.** Nothing for the P2P social layer or hot-path voting (rounds take hours and cost real fees; content stays off-chain by doctrine). But it is the first shelf implementation of the two mechanisms our chain plans keep arriving at: **sealed-bid uniform-clearing auctions** (ECONOMICS_DISCUSSION round 5 already selected batch auctions for launches/ad slots; sealed bids close the visible-book leak) and **receipt-free votes** for the few places votes must exist (dotless `/s/` contested-topic slots, Phase-4 scope-minimized community DAOs, mod elections). It is exactly the kind of external "privacy adapter at the edges" DESIGN.md's privacy-compatibility section reserved a socket for.
- **It does not weaken the anti-governance doctrine.** Receipt-freeness kills the *covert vote-buying market* (a voter can't prove compliance, so bribes can't verify delivery — and mask votes mean even a supervised vote can be silently changed or masked later). It does **not** stop BONK-style accumulation attacks: buying tokens still buys votes. Round 4's "minimize what any vote can touch" stays primary; CRISP hardens whatever minimal votes survive that filter.
- **Recommendation:** no build now. Name the Interfold as the candidate backend in the two pending design artifacts (the directory/dotless-slot ADR/BSIP and the economics auction/failure-mode registry), and spike on Sepolia only when a concrete mechanism decision is live or when real verifiers replace the mainnet mocks — whichever comes first.

---

## 1. What the Interfold actually is

An Ethereum protocol (no own chain) coordinating one-shot encrypted computations. Per E3 request:

1. **Request**: a requester calls `request()` on the Interfold contract with a committee size (enum `Minimum`/`Micro`/`Small`), an input window, an E3 program contract, and compute-provider params. Fees are **cost-plus**, quotable upfront via `getE3Quote()` (launch config: 10% margin, 1.82% gross treasury share). Mainnet fee token is **USDS**.
2. **Sortition**: staked ciphernodes hold tickets (`floor(sUSDS balance / ticketPrice)`, snapshotted at `requestBlock − 1`); each scores every ticket as `keccak(node, ticket#, e3Id, seed)` and submits its single best — the min-of-N-draws construction makes wallet-splitting pointless. Entropy is a committed **future blockhash** (EIP-2935), explicitly documented as *not* claiming VRF-grade randomness. Extra nodes are selected as standing backups; the lowest address becomes the aggregator.
3. **DKG**: the committee runs publicly verifiable DKG (**PV-TBFV** — publicly verifiable threshold BFV via `fhe.rs`): every key-generation and decryption-share step carries ZK attestations with per-operator attribution for slashing.
4. **Input window**: data providers encrypt to the committee key and submit onchain through the E3 program's `publishInput()`, each input carrying ZK proofs (generic: correct BFV encryption via GRECO; app-specific: eligibility etc.). Inputs land in a Merkle tree whose root later anchors the compute proof.
5. **Compute**: a compute provider runs the FHE program over the ciphertexts and posts the encrypted output with a proof. Verifiable backends: **RISC Zero zkVM** today (SP1, Jolt "coming soon"); **oracle/optimistic backends** planned for computations FHE+ZK can't yet afford.
6. **Threshold decrypt**: the committee decrypts *only the output* ciphertext; a decryption-verifier contract checks the shares; `PlaintextOutputPublished` fires; rewards distribute.

Failure at any stage (13 enumerated reasons, per-stage timeout windows — Sepolia config: committee 1h, DKG 2h, compute 24h, decrypt 1h) triggers a refund manager that splits escrow between requester and honest nodes. Slashing has two lanes (attestation-based immediate; evidence-based with appeal window). Operator floor on mainnet: **32,000 FOLD bond + 1,000 sUSDS per ticket**, 8+ cores / 32 GB / NVMe.

The structural point for us: **the trust surface is a per-round M-of-N committee**, economically secured by FOLD. Everything else (inputs, proofs, results) is Ethereum-verifiable by anyone.

## 2. CRISP — the voting reference, and why it's "MACI generalized"

CRISP (Coercion-Resistant Impartial Selection Protocol; full-stack example in the repo: React client, bypassable Rust relayer, Noir circuits + generated Honk verifier, RISC Zero FHE program, Hardhat contracts) implements secret ballots where:

- **Eligibility is proven inside ZK**: an ECDSA signature plus a Merkle inclusion proof against a census (e.g. token balances at a snapshot block) — the chain learns "an eligible voter voted," configurable up to unconditional anonymity.
- **The tally is homomorphic addition** over BFV ciphertexts inside RISC Zero — the zkVM proof pins the tally to the input Merkle root, so *all* accepted votes are provably counted (no selective omission).
- **Receipt-freeness comes from vote masking** (the part beyond classic MACI writeups): anyone — the voter later, or any third party — can homomorphically add an encryption of zero to any slot, including empty slots. The submission circuit is an OR-proof: *(authenticated + valid vote)* OR *(valid encryption of zero added to the existing slot)* — structurally identical onchain. Consequences: a coerced voter can comply under observation and silently re-vote or be masked afterward; observers can't build a who-voted list, infer timing, or even detect abstention. This is receipt-freeness as a systems property, not a UX promise.

Limitation Vitalik flags, confirmed by the docs: **verifiable compute is additive-only today**. Yes/no counts, weighted sums, quadratic-style aggregates — fine. Auction clearing (comparisons, argmax, sorting) is "BFV-friendly arithmetic in your Secure Process" plus a compute provider you trust optimistically until the slashing-based path ships.

## 3. Status, token, ethos (as of 2026-08-19)

| Fact | Detail |
| --- | --- |
| Rebrand | Enclave → The Interfold; docs/repo renamed (`theinterfold/interfold`; old `gnosisguild/enclave` redirects) |
| Mainnet | Contracts deployed (Interfold `0x28cF63B4…c715` etc.) but bootstrapped with `MockE3Program` + mock ciphertext verifier, "intended for public-network rehearsal"; `requestsPaused()` may be on during operator onboarding |
| Sepolia | Deployed with `DEPLOY_MOCKS=true`, **no ZK verification** — accepts any proof; for node-ops wiring only |
| Real verifiers | DKG + decryption aggregator circuits exist (`DkgAggregatorVerifier`, `DecryptionAggregatorVerifier`) but are live on no public deployment yet |
| Demos | CRISP PoC + **Aragon secret-ballots demo live** (dao.theinterfold.com); network dashboard live |
| FOLD | 1.2B supply; TGE transferability callable **today** 14:00 UTC (`tge()`, permissionless). Auction 1 (Jul 8–10) cleared 0.02154816 USDC/FOLD ≈ **$25.8M valuation** (matches seed/Legion rounds); Auction 2 (2% of supply, USDC, closed today 13:06 UTC) |
| Distribution | Community 51.65% (Foundation treasury 41.28% 48-mo linear, unsold CCA ≤6.36% unlocked, airdrop ≤4% 24-mo) vs Gnosis Guild 20% (48-mo), investors 18.85% (**unlocked at TGE**), team 9.51% (24-mo) |
| Auction ethos | Uniswap Continuous Clearing Auction run by **Interfold Ltd. with mandatory KYC/AML and jurisdiction screening** — a compliant issuer launch, not a fair launch |
| Partners shown | Aragon, Taiko, **Aztec**, MetaLex, Legion, Session, Boundless, Encrypted Mempool |

Two ethos notes worth recording: (a) the FOLD launch being a transparent, KYC-gated CCA — while the protocol's flagship use case is sealed-bid auctions — is a pragmatic choice, but it locates the project firmly in the compliant-issuer world, philosophically far from this repo's fair-launch/no-issuer instincts; (b) the committee model means any Bitsocial use imports FOLD staking economics and (for fees) USDS into the loop. Both argue for edges-only integration, same conclusion as DESIGN.md's alternative-C reasoning about living inside other projects' semantics.

## 4. Trust model vs bitsocial-chain doctrine

Our inbox design has **zero operators** in the trust path; the Interfold has a per-round committee that can (colluding above threshold) decrypt individual posted ciphertexts, and (below liveness threshold) stall a round into the refund path. Vitalik's framing is the honest one: M-of-N for liveness and coercion resistance is *unavoidable given present-day technology* — the alternative (obfuscation) doesn't exist yet. What makes it tolerable for our purposes:

- Every failure mode is **bounded to the round**: a stalled or corrupted E3 fails loudly, refunds, and can be re-requested — nothing about it can hold `.bso` state, BSO balances, or social data hostage. The committee never custodies assets; it custodies *secrecy*.
- Everything except secrecy is publicly verifiable: eligibility, inclusion (Merkle-root binding — "all posted votes are counted" is a proof, not a promise), tally correctness, decryption-share validity.
- The sortition writeup is refreshingly honest about its entropy (committed blockhash, proposer-influenceable at the margin, no VRF claim) — the right epistemic hygiene, and a reminder that a high-stakes Bitsocial round should size committees and thresholds accordingly.

So: **acceptable for one-shot mechanisms whose worst case is "re-run the round"; unacceptable anywhere in the always-on trust path.** That boundary writes itself into any BSIP that references E3s.

## 5. Where it maps onto Bitsocial — and where it doesn't

**Non-fits, first and clearly:**

- **Hot-path social voting** (upvotes, karma, feeds): hours-long round lifecycle, per-round fees, committee liveness — absurd for per-post interactions, and the protocol deliberately keeps content votes off-chain anyway.
- **Anything always-on or custodial** (§4 boundary).
- **Not a reason to create governance.** Round 4 of ECONOMICS_DISCUSSION stands: governance with something to steal is a market for control, and receipt-freeness doesn't change that — it removes *verifiable vote-selling* (a bribe can't confirm delivery; a coerced vote can be silently reverted), which raises collusion costs, but token accumulation still buys outcomes. CRISP hardens votes that survive the minimize-scope filter; it never justifies adding votes.

**Fits:**

1. **Sealed bids for the batch-auction machinery we already chose.** Round 5 selected uniform-clearing batch auctions as the fair-launch and anti-sniping mechanism (and the ad-auction design settles revenue the same way). Public-bid batch auctions still leak the book during the window — large bidders shade, everyone reacts to everyone. Sealed-bid uniform clearing is the textbook completion, and the Interfold is its first production-shaped implementation (encrypted bids + eligibility/range ZKPs + verifiable-or-optimistic clearing). Fit constraint: E3 latency (committee + DKG ≈ hours) suits **slow auctions** — launch windows, `.bso` premium-name drops, slot allocation, daily ad slots — and rules out per-block clearing (FM-AMM cadence stays public-bid or moves under a different privacy tool). Caveat: clearing needs comparisons → optimistic/oracle CP today (§2).
2. **The dotless `/s/` contested-topic slot.** The Seedit discovery design's pending ADR/BSIP needs an allocation mechanism for contested slots; the two obvious candidates are an auction or a community vote, and both have the same failure mode in public form (sniping/signaling wars; brigading/retaliation). The Interfold is currently the only shelf implementation of either mechanism with privacy *and* public verifiability. The ADR should name it as a candidate backend rather than reinventing the cryptography.
3. **The votes that must exist anyway.** Phase-4 scope-minimized community DAOs, mod elections in large communities, contested community polls: on a *social* network the coercion story is concrete in a way DeFi's isn't — voting "wrong" in public invites brigading, harassment, and retaliation inside the very community the vote governs, and public participation lists chill turnout. CRISP's property set (secret ballot + hidden participation + forced-abstention resistance + receipt-freeness) is built for exactly this. This is the strongest *social-specific* reason the Interfold matters.
4. **Private aggregate signals (additive → supported today).** The class of primitive DESIGN.md's privacy-compatibility section anticipated ("a valid tip was paid", "this user is eligible" as proofs/commitments): threshold-revealed flag tallies (show a report count only when ≥N eligible members flagged, never who), community surveys, grant-round style weighted sums. Far off and per-round costs make them occasional-use, but they're additive tallies — the one thing fully verifiable now.
5. **Noir convergence.** CRISP's circuits are Noir with generated Honk verifiers — the same toolchain RESEARCH_AZTEC_VS_FACET.md already recommended adopting regardless of chain choice. One ZK skillset now covers the Aztec lane (private payments/post permits), our own future verifiers, and E3 programs. The Aztec↔Interfold partnership also confirms the two are complementary, not competing: **Aztec = continuous private *state* (balances, payments, per-user capabilities); Interfold = one-shot private *collective computation* (votes, auctions, tallies).** Our privacy-lane map now has two named tools with disjoint jobs.

## 6. Options

**A. File-and-watch (recommended now).** No build, no dependency. Adopt the Interfold as the standing answer to "how would Bitsocial ever run a vote or auction that matters," and track the §7 signals. Cost: zero.

**B. Name it in the pending design artifacts (recommended alongside A).** Concretely: (i) the directory/dotless-slot ADR/BSIP lists sealed-bid E3 auction and CRISP-style secret ballot as candidate allocation mechanisms with the §4 trust boundary spelled out; (ii) the economics failure-mode registry records "sealed-bid variant of the uniform-clearing batch auction — backend exists (Interfold), latency confines it to slow auctions, clearing currently optimistic-trust"; (iii) any future community-DAO template notes receipt-free voting as the default for member votes. This costs a few paragraphs and keeps mechanisms pluggable — we commit to the *mechanism shape*, not the vendor.

**C. Sepolia spike (later, gated).** When a concrete mechanism decision goes live — or when real verifiers replace the mainnet mocks — run CRISP end-to-end: measure `getE3Quote()` fees per committee size, real wall-clock per phase, browser proving time for the Noir input proofs, and the ops burden of the requester role. Exit criteria mirror the Aztec spike: costs sane for occasional rounds? proving UX acceptable? committee failure/refund path behaves? Note the current Sepolia deployment can't validate proving correctness (mocks accept any proof) — the spike is worth more after `ENABLE_ZK_VERIFICATION` deployments exist publicly.

**D. What not to do.** Don't put E3s in the always-on trust path; don't couple `.bso` registry semantics to committee liveness; don't adopt FOLD exposure as protocol infrastructure while the token is week-one and 48.35% of supply is insiders on vesting curves; don't treat "private governance" as license to expand what governance touches.

## 7. Risks & monitoring signals

- **Launch-week protocol.** TGE was *today*; mainnet runs mock verifiers explicitly labeled rehearsal; requests may be paused. Nothing here is production for months. Watch: real `DkgAggregatorVerifier`/`DecryptionAggregatorVerifier` on a public deployment, `requestsPaused()` lifting, first non-mock mainnet E3s.
- **Committee economics untested.** Small committees (size enum tops out at "Small"), operator set forming now; collusion-to-decrypt and stall-for-refund games have no track record. Watch: operator count/distribution on the dashboard, slashing events, whether high-stakes rounds (Aragon DAOs) actually run.
- **Additive-only verifiability.** Auction clearing rides optimistic/oracle CPs until slashing-based compute or cheaper FHE comparison lands. Watch: SP1/Jolt backends shipping, the promised slashing-based CP design, any ZK-over-FHE cost breakthroughs.
- **Cost/latency unknowns.** Cost-plus pricing exists but real magnitudes (per committee size, per input count) are unmeasured — spike item C. A mechanism that costs more than a contested slot is worth prices itself out.
- **Token/issuer risk.** KYC'd CCA by Interfold Ltd., investors unlocked at TGE, Foundation 41% on a 48-month curve: standard compliant-launch shape, with the standard concentration and regulatory-posture caveats. Privacy-tech regulatory heat applies here as it does to Aztec — though a voting/auction protocol has a cleaner story than a payments mixer.
- **MACI-ecosystem alternative.** If Bitsocial ever wants only simple token-weighted polls, PSE's MACI line (coordinator-based, no FHE) remains the lighter, older alternative — less general, single-coordinator trust for privacy, but battle-tested in Gitcoin/clr.fund contexts. Worth a one-day comparison before any real adoption; the Interfold's advantage is generality (arbitrary FHE programs, auctions) and no single coordinator.
- **Obfuscation horizon.** Vitalik's closing point: ideally indistinguishability obfuscation eventually removes the committee entirely. Decades-scale; the M-of-N committee is the present-day ceiling, which is exactly why §4's blast-radius boundary matters.

## 8. Sources

- theinterfold.com (partners, live demos: dao.theinterfold.com, dashboard.theinterfold.com)
- docs.theinterfold.com: `introduction` (rebrand note, stack), `what-is-e3`, `architecture-overview` (actors, contracts, lifecycle, Sepolia timeout config, CP roster), `computation-flow` (request/fees `getE3Quote`, phases, refund `WorkValueAllocation`), `cryptography` (PV-TBFV, circuit phases C0–C7), `internals/sortition` (ticket lottery, blockhash entropy, min-of-N sybil argument, aggregator), `ciphernode-operators` (mainnet + Sepolia addresses, **mock-verifier and requests-paused caveats**, 32K FOLD bond, 1K sUSDS/ticket, USDS fee token), `tokenomics` (1.2B FOLD, distribution/unlocks, LGPLv3, funding rounds at $20M/$25.8M), `faq/auction` (Auction 2 window closing 2026-08-19 13:06 UTC, `tge()` at unix 1787148000, KYC/AML, CCA mechanics, Auction 1 clearing 0.02154816 USDC)
- docs.theinterfold.com/CRISP/introduction (full-stack layout, Noir/Honk verifier, RISC Zero homomorphic addition, bypassable relayer, mask votes)
- blog.theinterfold.com: "Vote Masking and the Problem of Receipt-Freeness" (OR-proof construction, GRECO encryption proofs, temporal/participation/forced-abstention privacy)
- github.com/theinterfold/interfold (repo id 801339558; `gnosisguild/enclave` redirects there — same codebase)
- Vitalik Buterin, tweet, Aug 2026 (generalized-MACI endorsement; security-property summary; additive-only ZK-over-FHE limitation; slashing-based compute WIP; obfuscation endgame) and *Minimal Anti-Collusion Infrastructure* (ethresear.ch/t/5413)
