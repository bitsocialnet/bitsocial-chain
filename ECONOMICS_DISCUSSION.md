# Economics Discussion — Burn, Liquidity, and the Stage 2 Constraint

**Status: open design discussion, not a spec.** Nothing here is normative or committed. Companion to [DESIGN.md](DESIGN.md) (architecture reasoning) and [POC_LIMITATIONS.md](POC_LIMITATIONS.md), which both defer economics to future work. This document captures a recurring design debate so it survives outside chat logs. Last updated 2026-08-18.

## Context

The public tokenomics story for BSO (see [chain.bitsocial.net](https://chain.bitsocial.net)) is burn-centric: network layers settle in BSO, a share of fees is burned, the rest pays for security; community ad revenue burns the community's token at settlement ("burn at the point of revenue, not buyback from a treasury"). Phase 5 of the master plan proposes AgoraSwap, a community DEX where every ecosystem token pairs with BSO.

In July 2026 a community discussion raised a serious challenge to the burn-centric framing, summarized below. This doc records the argument, the counterarguments, the hard constraints, and the design space that survives them.

## The challenge: burns have diminishing returns; liquidity might matter more

The argument, steelmanned:

1. **A burn on a fixed-supply token is a pro-rata buyback.** It is value accrual, but it does nothing *functional* for the network. On a token that is already fixed-supply and zero-emission, extra scarcity has diminishing narrative and economic returns.
2. **Liquidity migrates to CEXes as tokens mature.** A v2-style pool is good price discovery at high uncertainty — its inefficiency covers every possible price — but once a token approaches a fair market price with lower volatility, traders stop tolerating high price impact and fees, and volume moves to order books. That migration makes the token custodial and USD-denominated, weakening both the token's and BSO's money properties.
3. **Therefore**: the BSO fee flow that would be burned might be better spent on a "smart liquidity" system — dynamic, concentrated, protocol-owned liquidity around ecosystem tokens that gets close enough to order-book execution that marginal trading stays on-chain.
4. **Prerequisite**: this only works for tokens with immutable value accrual that can settle around a fair price. Volatile tokens without intrinsic value can't be market-made tightly.
5. **The numeraire prize**: if ecosystem trading happens on-chain against BSO pairs instead of on CEXes against USD, BSO gains moneyness — medium-of-exchange and reserve-asset demand, the way ETH and SOL accrued monetary premium from being the pair asset of their ecosystems.

Points 1, 2, and 5 are substantially correct. Point 3 is where the problems start.

## What protocol-owned "smart liquidity" actually costs

**A protocol market maker is a risky trading business, not a mechanism.** Concentrated liquidity positioned around a believed fair price is adversely selected every time the price moves: the rebalancing losses (loss-versus-rebalancing, LVR — Milionis, Moallemi, Roughgarden & Zhang 2022) are paid by whoever owns the position. If the protocol owns it, the bleed comes out of the exact fee flow that would otherwise be burned. A burn is riskless accrual; protocol-owned market making is spending revenue to subsidize tight spreads and hoping fee income exceeds the adverse-selection loss. The honest framing is "liquidity as subsidized infrastructure," which may be a good trade — but it has a P&L, and the P&L can be negative indefinitely.

**The fair-price oracle problem.** Liquidity that repositions "intelligently" needs to know where fair price is. An external oracle reintroduces a trusted, manipulable dependency. A purely reactive on-chain rule (e.g. TWAP-following) is dumb liquidity again, and its rebalancing transactions are themselves front-runnable. This is the core unsolved problem of the proposal, not an implementation detail.

**Precedents cut both ways.** Lifinity (Solana) ran oracle-anchored protocol-owned market making and reported sustained profitability — an existence proof that it can work. Bancor v2.1/v3 offered impermanent-loss insurance backed by the protocol and had to suspend it in 2022 when the liabilities compounded — the canonical failure. OlympusDAO popularized protocol-owned liquidity via bonding with mixed long-term results. The base rate is not encouraging, and none of these operated under a full-decentralization constraint.

**One counter-argument to the numeraire thesis.** The market has shown revealed preference for stable numeraires: ETH pairs lost most flow to USDC pairs on Uniswap over time, because volatile-vs-volatile pairs are harsher on LPs and users think in USD. Solana memecoin flow cuts the other way. "Everything pairs with BSO" has a real LP-risk and UX cost that should be weighed, not assumed away.

## The Stage 2 constraint

Bitsocial Chain intends to be a fully decentralized, Stage 2 chain in the Facet/Ethscriptions mold. Facet's current shape (facet.org, docs.facet.org, and L2Beat's assessment, checked 2026-07-04) is the reference point:

- L2Beat rates Facet **Stage 2**: "the project passes the walkaway test." It is a based rollup — no sequencer, "no privileged entity that sequences transactions or produces blocks."
- Its rollup contract is immutable: "no guardians, security councils, or admin keys." Upgrades are fork-based: deploy new rules, old versions run forever, users choose.
- There is **no treasury and no protocol-owned fund of any kind**. FCT is minted only by burning ETH for L1 calldata, and FCT used as gas is burned — because there is no operator to pay.
- Arbitrary EVM contracts deploy permissionlessly (FacetSWAP, an AMM DEX, already runs on Facet).

Two conclusions follow directly:

1. **Burn is the uniquely Stage-2-native fee sink.** It requires zero custody, zero strategy, zero oracle, and zero governance. Every alternative use of fee flow — including routing it to a liquidity system — adds decision surface, and decision surface is precisely what Stage 2 eliminates. This is a stronger defense of the burn than "scarcity": the burn is not just simple, it is the only value-accrual mechanism with no one to trust.
2. **The line is discretion, not liquidity.** Immutable AMMs, immutable vaults, and permissionless LPing are fully Stage-2-compatible. What breaks the model is a protocol-*run* strategy: an operator with discretion, an external price oracle in the trust path, or governance-updatable parameters. Protocol-owned "smart liquidity," taken literally, is all three.

## The physics constraint

The strict Facet pattern imposes limits no mechanism design can route around (Facet's live numbers, July 2026):

- **12-second blocks, no soft confirmations**, ordering fixed by L1 inclusion, base-fee only (no priority fees).
- **No batching yet** — each L2 transaction is its own L1 transaction; L2Beat measures ~$2.94 average cost per user operation over the past year. Activity is on the order of tens of operations per day.

On this architecture, *no* venue — AMM, order book, or hybrid — competes with CEX execution: quotes go stale for 12 seconds at a time, arbitrageurs pick off every stale price, and per-swap costs of dollars kill small trades. If competitive on-chain execution ever becomes a goal, the binding work is architectural (batch submission, blob DA, faster or app-specific sequencing — the "graduate to the real appchain stack" path in DESIGN.md), and it must come before liquidity mechanism design, not after.

One mitigating interaction: LVR scales with the square of volatility, so slow blocks hurt volatile pairs far more than stable ones. The prerequisite in the original argument — ecosystem tokens need genuine value accrual and low volatility *first* — independently mitigates the slow-chain problem. The sequencing (value accrual before liquidity engineering) is right for a reason beyond the one originally given.

## The design space that survives: trustless "smart" liquidity

There is a well-developed menu for getting most of the benefit of smart liquidity without a trusted operator. Guiding principle:

> **The protocol is never the market maker. It is the immutable venue that makes market making permissionless and fair.**

Candidate mechanisms, all compatible with an immutable, adminless deployment:

- **Per-block batch auctions** (CoW-style uniform clearing price). Every order in a block clears at one price, eliminating sandwiching and intra-block ordering games. Unusually well suited to a slow based chain: if the venue cannot be fast, it can be fair — and fairness, not speed, is what a Stage 2 chain can credibly offer that Binance cannot.
- **Auction-managed AMMs** (am-AMM — Adams, Moallemi, Reynolds & Robinson 2024). The right to manage a pool's liquidity is continuously auctioned on-chain; the winning manager pays rent that flows to LPs or is burned. The "smartness" is outsourced to permissionless competition instead of trusted to the protocol.
- **Intent/solver settlement** (UniswapX-style Dutch auctions). Competing fillers give users near-CEX execution; the contract only verifies settlement. The protocol takes no inventory risk.
- **Immutable backstop liquidity, if protocol-owned liquidity exists at all**: full-range, funded one-shot, never rebalanced, no withdrawal path. Dumb-but-wide backstop liquidity is the "safety net" that historically *attracts* independent market makers (they quote inside it), and it requires no discretion.
- **Dynamic fees from on-chain-only signals** (e.g. volatility-responsive fees computed from pool state). Deterministic rule, no oracle.

This also answers the open question from the original discussion — whether protocol liquidity attracts or repels independent MMs: backstop liquidity plus permissionless inside-the-spread competition is the configuration that attracts them, mirroring how designated-market-maker structures work in traditional venues.

## Resolution (as of July 2026)

- **Burn vs. liquidity is a false binary.** The published design already splits fees (burn share + security share); a liquidity leg would be an extension, not a reversal. But any liquidity leg must be an immutable, permissionless mechanism from the menu above — never a managed treasury position. The existing "no treasury, no buyback bot, no trusted middleman" framing for community ad-revenue burns is correct and stands.
- **Burn remains the default sink** for any fee flow that lacks a trustless better use, because it is the only zero-trust option.
- **The real Phase 5 (AgoraSwap) blocker is physics, not mechanism**: batching/DA/sequencing decisions determine whether any liquidity design is viable. Mechanism choice (batch auction vs. am-AMM vs. hybrid) comes after.

## Round 2: refinements from the follow-up discussion (July 5, 2026)

The discussion continued and the proposal sharpened. Recorded positions and what they change:

**The purpose is venue capture, not yield.** Protocol-owned liquidity is not meant to make money; it is meant to take spot market share away from custodial USD venues. The sustainability condition is a budget, not a profit target: average losses must stay comfortably inside swap-fee income (e.g. with a 5 bps fee, losses under roughly half of fee revenue). This matches this doc's "liquidity as subsidized infrastructure" framing — the disagreement dissolves once stated this way. What remains is an engineering requirement: the subsidy must be measured (rebalancing P&L tracked on-chain) so the budget is enforceable rather than aspirational. One caution stands: LVR is not uniform in time — it scales with the square of volatility and concentrates in exactly the tail events — so "loses a little on average" can mean "one three-day crash eats a year of fees" unless the tail is engineered for specifically.

**"Smart" means retreat, not pursuit.** The refined definition: concentrated liquidity that widens or withdraws when volatility spikes and returns when it stabilizes — not liquidity that chases fair price like a CEX market maker. Normal appreciation (a 10x over six months) is in scope; memecoin regimes (10x and −90% in a day) are out of scope, with no demand for tight liquidity there anyway. Two consequences:

- This is *more* tractable under the Stage 2 constraint than the original framing: volatility-responsive width and fees can be a deterministic function of on-chain state (realized volatility from the pool's own history). No operator, no external oracle, no discretion.
- It concentrates the entire difficulty into tail latency. A reactive rule cannot respond faster than one block, and under based sequencing the arbitrageur reaches the stale quote before the retreat rule can fire. On 12-second blocks, "move out of the way" loses the race by construction; per-block batch auctions (below) are currently the most credible defense, because they neutralize intra-block pickoff instead of trying to outrun it.

**No external oracle: fair price ≈ current price, layered over a dumb base.** The refined design keeps full-range x·y=k liquidity underneath permanently (price discovery, never breaks) and adds the concentrated smart layer on top, only for tokens past the maturity threshold where liquidity historically migrates to order books (~$50–100M mcap). There is a battle-tested reference design for exactly this: **Curve v2 crypto pools**, which concentrate liquidity around an internal EMA price derived from the pool's own trades (no external oracle) and only repeg when accumulated fees cover the rebalancing loss (profit-gated rebalancing). Caveats needing design attention:

- A repositioning rule keyed to the pool's own price can be gamed: push the price against the dumb base layer, trigger the reposition, profit on the reversal. EMA smoothing and profit-gating blunt this but do not eliminate it; attack cost needs quantifying.
- Curve v2's parameters are DAO-tunable; a Stage 2 deployment would fix parameters at deployment and change them only by fork, which raises the cost of mis-tuning.

**Batch auctions complement protocol liquidity; they do not bypass it.** (Answering a direct question from the discussion.) In CoW-style batch auctions, direct order-vs-order matches are a minority of volume; most flow still executes against underlying liquidity — solvers are an execution layer, not a liquidity source. The important interaction runs the other way: a uniform clearing price per block removes sandwiching and stale-quote pickoff *within* the block, and arbitrageur competition inside the auction returns part of what would have been LVR to the pool (see the FM-AMM batch-trading research). Batch auctions shrink the adverse-selection bleed of whoever provides the liquidity — including the protocol. The proposal and this doc's mechanism menu describe the same system from different ends: dumb full-range base + policy-driven concentrated layer + per-block uniform clearing + independent MMs quoting inside.

**The numeraire battle is fought with flow, not only spreads.** Agreed on both sides: USD pairs win if they have lower volatility *and* lower spreads; BSO pairs need competitive spreads for the battle to exist at all. The addition recorded here: market makers follow order flow, not numeraire comfort — Binance has MMs because it has flow. Bitsocial's native distribution means retail order flow originates inside Bitsocial apps; if apps route that flow to AgoraSwap BSO pairs by default, MMs come to serve it and hedge the BSO leg elsewhere. Design implications: the system needs one deep canonical BSO/stable market as the hedging and entry leg (the SOL model: SOL/USDC deep, everything else pairs against SOL), and splitting venues — dumb canonical BSO liquidity on L1, where BSO already trades, smart eco-token/BSO liquidity on the appchain — is coherent and mirrors the mainnet/L2 structure the wider ecosystem already has.

**Gas fees and swap fees are different flows.** The published burn + security split refers to chain gas fees. Swap fees on AgoraSwap are venue revenue, a separate flow. The refined claim is narrower than the original challenge: not "replace the burn" but "the surplus BSO flow not needed for security should not default 100% to burn when a liquidity leg could buy venue capture." Burn remains the zero-trust default for any flow without a trustless better use.

**Community tokens are companies; the chain is not.** The trust framing from the discussion, recorded: community coins sit closer to companies than to L1 assets, and their central risk is the owner rugging the token to reincorporate the community's value as an off-chain company. Immutable value accrual (revenue that burns and settles in-contract, per the ad-auction design) plus native web3 distribution is the anti-rug mechanism — it converts "trust the community owner" into "verify the contract," the same move Facet makes at the chain level. BSO-level liquidity policy is a separate trust object: "programmatic" is acceptable there only if it means immutable rules over on-chain state, never managed discretion.

## Round 3: community-token issuance and the "PvE" thesis (July 6, 2026)

Follow-up ideas from the same community discussion, recorded as input to Phase 4/5 design:

**The PvE thesis.** On memecoin chains, asset supply grows without bound while the user base stagnates, so every new token competes for the same exit liquidity and the market is adversarial by construction ("PvP"): traders dump fundamentally sound assets to chase rotations, and long-term holders are the exit liquidity. If token issuance is structurally tied to real communities — one community, one token — then the number of assets scales with adoption rather than with hype, and the ecosystem is "PvE": holders are exposed to the growth of the network, not to each other's rotation games. Recorded as a positioning thesis, not a theorem: the strong version ("aggregate fiat value increases forever") assumes user growth and ignores repricing, but the structural claim (asset count tracking community count changes market character) is sound and follows from the existing one-token-per-community design.

**Issuance gating.** The sharper proposal: communities should not be able to launch a token until they clear real-activity thresholds. A 50-member community with a token is structurally a victim-hunting machine, and incentive patches (sniper taxes, diamond-hand rewards) are gameable copes; only a barrier to entry changes the game. The Stage 2 tension is immediate: gating needs a judge. Governance judgment is not Stage 2, and naive on-chain metrics (member counts, activity counters) are sybilable for free, especially since the social layer is P2P and the chain cannot natively verify that a community is real. The most promising direction recorded here: **use revenue history as the threshold** — a community becomes token-eligible only after some cumulative value has settled through its on-chain ad/tipping contracts over some minimum period. That metric is deterministic (Stage 2-clean), and it is costly to counterfeit precisely because faking it requires actually burning real value through the same contracts the token economy will run on. Costly signals beat clean-looking counters.

**"51/49."** A design philosophy was teased under this name but not defined; placeholder pending a real writeup.

**In-app liquidity.** "The difference between a unicorn crypto project and a low cap comes down to in-app liquidity" — consistent with rounds 1 and 2: native distribution routes order flow to in-app venues, and venue quality is what keeps it there.

## Round 4: governance attack surface (July 7, 2026)

The BONK DAO treasury drain (June 30 to July 5, 2026, roughly $20M per Chainalysis's public investigation: an anonymous proposal to drain the treasury, passed by an attacker who accumulated voting power in the preceding days, then liquidated) circulated in the community discussion as evidence against token-holder governance. Two notes for this doc:

- **It validates the burn-at-revenue design directly.** Governance attack surface scales with what governance controls. A community whose revenue burns and settles mechanically at the point of sale (the ad-auction and tipping design) accumulates no pooled treasury worth draining; the honeypot never forms. Where community DAOs do hold funds, the classic mitigations (timelocks, exit windows, bounded treasuries, quorum floors) reduce but do not eliminate the attack, because the attack is economic, not technical: if control of the pot costs less than the pot, someone will buy control.
- **"AI delegate voting" was floated as a fix** (every holder's delegated AI agent votes honestly on their behalf, making quorum-sniping attacks impossible). Recorded skeptically: it raises attacker cost by raising participation, which is real, but it presumes an "honest" agent layer that is itself attackable (compromised delegates, manipulated inputs), and it does not change the structural fact that governance with something to steal is a market for control. The Stage 2 posture stays primary: minimize what any vote can touch; prefer immutable mechanisms and fork-based upgrades over votes; where community DAOs exist (Phase 4), design their scope so that capturing them is not worth the price.

## Round 5: community-token failure modes and the iteration question (August 7, 2026)

The discussion resumed a month later, moving from venue economics (rounds 1–2) and issuance gating (round 3) to the design of the community tokens themselves. The position recorded: making community tokens long-term investable means predicting every way a token can undeservedly go wrong and designing the system that sits closest to all the good outcomes and farthest from all the bad ones; the list is long (claimed at 100–200 considerations), resists summary, and different community types need different systems, not one. Sample questions raised: ideal owner allocation, owners accumulating on side wallets, early-buyer distribution and inflation levels, whether BSO tippers who hold no community token should benefit it, influencer pump-and-dumps, launch sniping, and long-term-holder rewards short of ponzi dynamics.

**The reflexivity argument, steelmanned.** The strongest point of the round: "ship a light system and adapt on the go" fails for tokens because design errors surface as price collapse, and price collapse destroys the trust needed to iterate. The worked example: excess inflation → whales quietly exit → −90% → the market reads it as a scam and the community disperses (on Bitsocial, migrates to another community) → no second chance to course-correct. Supporting observation: historically durable token communities formed around predictably scarce assets, and the lesson generalizes beyond the supply number to every feature of a token. A second, subtler point: whales do not announce reasons. The market cannot distinguish "sold because the inflation schedule is broken" from "sold because the owner is doing something shady," so a mechanical design flaw converts into a reputational narrative about people — misattribution amplifies the damage. Both points are accepted and recorded.

**But total ex-ante design is not the conclusion — the law iterates, the contract doesn't.** Fully enumerating the failure modes of a reflexive system is not achievable, and the analogy offered in the discussion (the body of law that makes startups investable) demonstrates the opposite of what it was offered for: securities law was not designed up front by prediction; it accreted through a century of failures and case law. What reflexivity actually forbids is narrower — iterating a *live* token's trust-bearing parameters. The resolution, already implicit in this repo's Facet-derived upgrade philosophy:

- **Freeze at the instance level.** Each deployed community token is immutable in its monetary core — supply schedule, allocations, vesting, value-accrual rules. No tuning path, no governance path. This also answers the round's inflation question: whatever level a design chooses, it is fixed at deployment, because "adjustable inflation" is precisely the hole the reflexivity argument closes.
- **Iterate at the system level.** Token designs live in a versioned template registry. Lessons learned ship as template v2 for *new* communities; existing tokens run their original rules forever, exactly like Facet's fork-based upgrades. Iteration happens across cohorts, never within a token.
- **Precedent.** Bitcoin absorbed enormous protocol iteration while its monetary policy stayed untouchable. That is the line, and it is the same discretion line drawn at the chain level in rounds 1–2.

The "different communities need different systems" position concedes this architecture: multiple systems means a template set, and a versioned template set is exactly what makes learning safe under reflexivity. The two positions in the debate — "design everything up front" and "you can't predict everything" — are both right at different layers.

**What the existing filter already answers.** Several of the round's questions resolve against prior rounds rather than needing new design: token gating (round 3: revenue-settled threshold); sniper taxes and diamond-hand rewards (round 3: gameable copes — barriers, not patches); owner rug risk (round 2: burn-at-revenue converts "trust the owner" into "verify the contract"); smart BSO liquidity (rounds 1–2, including where the Stage 2 boundary sits); inter-community collaboration incentives (round 3's PvE structure plus the shared numeraire: every community's growth deepens the common BSO liquidity and hedge leg instead of competing for exit liquidity). One general principle falls out and is worth stating once: **any mechanism that must identify a class of actor — sniper, influencer, whale, insider — needs a judge, and fails the Stage 2 filter.** The influencer pump-and-dump question therefore gets an honest answer: no Stage-2-clean mechanism prevents it directly; what survives is entry barriers, immutable value accrual, distribution shape, and time. Policing is not on the menu; structure is.

**Launch sniping is the t=0 stale quote.** The sniping problem is the same adverse-selection problem rounds 1–2 treated in steady state, at its most extreme moment: a quote (the launch price) that everyone knows is stale. The machinery already selected there — uniform-clearing batch auctions — doubles as the fair-launch mechanism: clear the opening window at one price so ordering games at genesis have nothing to win. LBP-style descending auctions are the same idea stretched over time. No separate anti-snipe gadget is needed, and per round 3, taxing snipers after admitting them is a cope.

**New failure modes recorded (input to the registry):**

- **Owner allocation band.** Too few tokens and the owner rationally neglects the token (no upside in stewarding it); too many and the position is an extraction overhang the market prices as dump risk. This is the founder-equity problem, and the direction is protocol-standard allocation bands with enforced vesting per template, not free choice per owner. Magnitudes are an open question.
- **Side-wallet obfuscation.** Owners accumulating on unlinked wallets cannot be prevented — sybil wallets are free and the chain cannot see intent. What the protocol can do is make the *declared* position verifiable by construction (legible official allocations, enforced vesting), so that the official position carries no uncertainty and undisclosed positions carry narrative risk instead. Note the compounding interaction with misattribution: hidden accumulation becomes hidden distribution later, feeding exactly the "shady owner" story that silent whale exits already invite.
- **Misattributed exits.** Beyond transparency defaults, the mitigation unique to Bitsocial is the social layer itself: a token whose community has a persistent home can litigate reasons in public, where anonymous memecoin markets cannot. Partial, not sufficient — recorded as design pressure toward maximum enforced legibility of insider positions.
- **Tip coupling.** Should BSO tips route a share to the community token's burn, so that non-holder engagement accrues to holders the way ad revenue does? Unresolved trade-off: taxing tips weakens the tipping norm itself (tips are the chain's native social primitive); not coupling leaves community-token value accrual entirely to ad revenue. Needs a real design pass rather than a default.

**The registry is the deliverable.** The claimed 100–200 considerations are exactly what this document exists to capture, and the standing invitation from this round is to write them down. Format: failure mode → causal mechanism → design constraint that prevents it → which template(s) it binds. Constraints universal to all templates (immutable monetary core, enforced allocation transparency, revenue-gated issuance) separate from per-template choices. This registry — not parameter values — is the Phase 4/5 design artifact: parameters are chosen last, inside constraints that survived both the registry and the Stage 2 filter.

## Round 6: correlated pairs and bridge liquidity (August 18, 2026)

Hayden Adams's [tweet](https://x.com/haydenzadams/status/2089531754004554215) introducing [*Correlated Pairs: How AMMs Win the Biggest Markets*](https://x.com/i/article/2089523718137466880) provides an independent market-structure lens on the existing numeraire debate. Its central observation is that on-chain liquidity tends to organize into clusters of correlated assets connected by a small number of higher-risk bridge pairs. LPs can provide the correlated pairs more cheaply because the two inventories move together; active market makers concentrate on the bridge pairs because those pairs carry more flow and justify the cost of hedging.

**What this strengthens.** The pattern matches round 2's proposed liquidity graph: community-token/BSO markets connected to the wider economy through one deep canonical BSO/stable bridge. That bridge is not a concession to dollar denomination; it is the entry, exit, and hedge leg that can make BSO-denominated markets practical. Native Bitsocial order flow can further attract independent market makers to the community-token/BSO side of the graph.

**What it does not establish.** Ecosystem membership does not make a community token and BSO correlated by definition. The relationship must emerge from actual price co-movement, shared economic exposure, LP demand to hold both inventories, or enough order flow to pay for the uncorrelated risk. Declaring a BSO pair selects a routing and settlement asset; it does not supply liquidity or make the pair cheap to market-make. The article also does not choose between external LPs and protocol-funded liquidity, passive and concentrated strategies, or continuous and batch execution. Its discussion of customizable AMMs does not solve LVR, tail latency, manipulation resistance, the Stage 2 discretion boundary, or the current Facet-style architecture's execution constraints.

**Design implication.** Treat correlated-pair structure as an eligibility test, not a slogan. AgoraSwap's long-term thesis remains a connected on-chain economy with BSO as the common routing asset, but the mechanism should not assume every community-token/BSO market deserves equally tight or subsidized liquidity. Where correlation is weak, a full-range base, wider spreads, retreat-on-volatility, batch clearing, and the BSO/stable hedge leg matter more—not less.

## Open questions

1. **Numeraire policy**: BSO pairs only, or BSO + stable pairs? What does the ETH-pairs-lost-to-USDC precedent imply for LP incentives and the moneyness thesis?
2. **Fee-split immutability**: can burn/security/liquidity percentages be fixed forever at deployment, or do they need adjustment — and if they need adjustment, what replaces governance? (Fork-based upgrades, per Facet, are the current best answer.)
3. **Volatility prerequisite**: can community tokens with immutable value accrual actually reach the low-volatility regime where tight liquidity is viable, and on what timescale?
4. **MEV under based sequencing**: ordering is decided by L1 builders, so the chain cannot internalize MEV at the protocol level. Do per-block batch auctions at the app layer capture enough of it?
5. **Bridge and settlement**: Facet is Stage 2 *without* a canonical bridge; value enters externally. What does that imply for how BSO itself reaches the appchain?
6. **Regulatory shape**: a protocol operating a discretionary market-making strategy looks like an investment scheme; mechanical burns and permissionless venues look like protocol rules. Another reason the discretion line matters.

Added after round 2:

7. **Tail latency**: can any retreat rule win the race on a based 12-second chain, or is per-block batch clearing the only real defense? What block cadence would the appchain need for the smart layer to be viable, and is that cadence compatible with staying based and Stage 2?
8. **Manipulation resistance**: for internal-price repositioning rules (EMA lookback, profit gates), what does the attack cost — capital needed to move the dumb base layer and trigger an exploitable reposition — look like versus defense parameters?
9. **The hedge leg**: where does the deep canonical BSO/stable market live (L1 vs appchain), and how deep must it be before independent MMs will quote eco-token/BSO pairs?
10. **Subsidy accounting**: how to measure rebalancing P&L / LVR on-chain so the "losses within fee budget" condition is enforced by rule (e.g. the smart layer auto-widens or retreats when its running P&L breaches budget) rather than monitored socially.

Added after round 3:

11. **Issuance gating**: what deterministic, sybil-resistant threshold can gate community-token creation on a Stage 2 chain? Leading candidate: cumulative revenue settled through the community's own on-chain contracts over a minimum period, since it is expensive to counterfeit by construction. What are the right magnitudes, and does gating create a perverse pre-token revenue meta?
12. **The "51/49" model**: undefined teaser from the community discussion; capture the actual definition when it is written up, then evaluate it against the Stage 2 filter like everything else.

Added after round 5:

13. **Template canonicalization**: fork-based template upgrades need a discovery layer. Without governance, what makes template v2 "the recommended one" — client defaults (the starter-set pattern already used at the social layer), registry ordering, social consensus? And who may publish a template at all: anyone (with clients curating), or a protocol-blessed set?
14. **Owner allocation bands**: what band and vesting shape per template type, and what evidence sets the magnitudes — where do "too few → neglect" and "too many → overhang" actually bind?
15. **Tip coupling**: route a burn share from BSO tips to the community token, or keep tips untaxed and let ad revenue carry accrual alone? If a share, what magnitude leaves the tipping norm intact?
16. **Transparency enforcement**: which insider disclosures can the protocol enforce by construction (allocations, vesting, owner wallets declared at issuance) versus merely encourage — and how much does enforced legibility actually shrink the misattribution problem?
17. **The failure-mode registry**: collect the full claimed 100–200-item list into failure → mechanism → constraint → template-scope form; determine which constraints are universal versus per-template, and which questions dissolve under the Stage 2 filter before parameterization ever starts.

Added after round 6:

18. **Correlation and route eligibility**: what evidence—realized correlation, LP P&L, durable order flow, or shared value exposure—justifies tighter community-token/BSO liquidity, and when should routing tolerate a direct stable pair instead of forcing every trade through BSO?

## References

- Facet: [facet.org](https://facet.org/), [docs.facet.org](https://docs.facet.org/), [L2Beat — Facet](https://l2beat.com/scaling/projects/facet) (Stage 2 assessment, risk analysis, cost and activity data; checked 2026-07-04).
- Milionis, Moallemi, Roughgarden, Zhang — *Automated Market Making and Loss-Versus-Rebalancing* (2022): the adverse-selection cost of passive liquidity.
- Adams, Moallemi, Reynolds, Robinson — *am-AMM: An Auction-Managed Automated Market Maker* (2024): trustless dynamic pool management via on-chain auctions.
- CoW Protocol (batch auctions, uniform clearing prices), UniswapX (intent-based Dutch-auction settlement): solver-competition execution models.
- Lifinity (oracle-anchored protocol-owned MM, positive precedent), Bancor v2.1/v3 IL insurance suspension 2022 (negative precedent), OlympusDAO bonding (protocol-owned liquidity, mixed).
- Egorov — *Automatic market-making with dynamic peg* (Curve v2 whitepaper, 2021): concentrated liquidity around an internal EMA price with profit-gated rebalancing — the closest existing implementation of oracle-free "smart" liquidity.
- Canidio & Fritsch — *Arbitrageurs' profits, LVR, and sandwich attacks: batch trading as an AMM design response* (2023, FM-AMM): per-block uniform clearing prices reduce LVR and sandwiching for the liquidity underneath.
- Balancer Liquidity Bootstrapping Pools (LBPs): descending-price launch auctions — the time-stretched form of uniform-clearing fair launch referenced in round 5.
- Hayden Adams — [introductory tweet](https://x.com/haydenzadams/status/2089531754004554215) and [*Correlated Pairs: How AMMs Win the Biggest Markets*](https://x.com/i/article/2089523718137466880) (2026): tokenized assets organizing into correlated-pair clusters connected by a few higher-risk bridge pairs; supports the BSO/stable hedge-leg framing without prescribing a protocol-owned strategy.
