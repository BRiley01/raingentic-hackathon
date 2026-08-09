# Agent Marketplace — Questions

Big-picture questions about the **agent marketplace** we're building. Separate from
`docs/open-questions.md`, which covers implementation decisions on the existing
travel-booking codebase.

**How to use this:** answer inline in the `> **A:**` block under each question. Leave it as
`_(unanswered)_` to skip. Answered items move up to **Resolved**; new questions raised by your
answers land in **Follow-ups**.

**Status key:** 🔴 **Blocking** — can't design around it · 🟡 **Shapes work** — wrong guess costs
rework · ⚪️ **Nice to pin** — a default will do

---

# Resolved

## The picture so far

**Yelp for agents.** The marketplace is a directory of *agents*, each listed with a **rating** and a
**cost**. A client agent queries by type, gets back candidates with ratings and prices, and decides
for itself which is worth paying. Payment is **x402 over Monad**, and one payment buys **one
request**. The marketplace takes **no fee** and never touches the money. After the exchange, the
client **rates** the agent.

**Two rails, two tiers — the demo does both, built by two sub-teams:**

| | Tier 1 — the marketplace | Tier 2 — the booking |
|---|---|---|
| **Who pays whom** | Client agent → seller agent's wallet | Client agent → real merchant |
| **Rail** | x402 micropayments on Monad | Rain scoped card |
| **What's bought** | *Information* — one answer to one query | The actual hotel / car / flight |
| **Existing code** | None — new build | `trip.ts`, `allocator.ts`, `scope-cards.ts` (works) |

## The handoff contract: `examples/trip.paris.json`

**The artifact tier 1 hands tier 2 is a `TripRequest`** — the shape in
`src/domain/shared/trip.ts`, with `examples/trip.paris.json` as the worked example. Already
zod-validated, strict at the boundary, unit-tested. Nothing to negotiate.

**Each seller agent produces one `LineItem`:**

```ts
{ id, domain, label, vendor, vendorUrl?,     // domain ∈ flights|hotels|activities|transport|dining
  maxSpend: { amountCents, currency },       // a cap, not the charge
  merchantAllowlist: [], payable: true }
```

**The client agent assembles the `TripRequest`** — it owns the trip-level fields no seller knows:
`tripId`, `traveler`, `budget`, `domainCaps`, `holdTtlSeconds`, plus the `items[]` it collected.

Two things fall out of this for free:

- **The self-declared `quality` score (7.5) rides along harmlessly.** `z.object` strips unknown
  keys rather than rejecting, so tier 1 can carry `quality` on its own objects and pass the same
  payload across — it just doesn't survive into the validated `TripRequest`.
- **The allocator is a free demo beat.** `allocate()` refuses any plan whose item caps exceed
  `budget` or a `domainCaps[domain]`, and reports **every** violated rule at once. A seller agent
  that recommends too-expensive options gets the trip *rejected on screen* — a real, already-built
  guardrail firing live. Worth staging deliberately (see 4.3).

Constraints seller agents must respect: item currency must match the trip currency, and
`vendorUrl` must parse as a URL if present.

**The worked example** (1.3): three hotel agents — **booking.com, hotels.com, expedia.com** —
differing in rating and price. The marketplace surfaces all three; the client weighs cost against
rating and picks. That tradeoff *is* the demo's central idea.

**Agents are named for the vendor they front, not for their tier.** No "good/better/best" appears
anywhere in the product — **the rating is what makes one good and another bad.** Consequences:
the agent's identity supplies `LineItem.vendor` / `merchantAllowlist` for free (matching what
`examples/trip.paris.json` already does), and the UI must carry the entire quality signal in
rating + price, since the name says nothing.

## What the wire actually looks like (6.1 = x402)

Picking x402 replaces the "pay wallet → get receipt → send receipt with query" sequence from 1.2.
In x402 the payment is **inside the request**, not before it:

```
client → marketplace:  GET /agents?type=hotel        → [good, better, best] w/ rating + price
client → agent(best):  POST /query {…}               → 402 PAYMENT-REQUIRED
                                                        accepts[]: amount, payTo, eip155:10143
client:                signs EIP-3009 (USDC)
client → agent(best):  POST /query + PAYMENT-SIGNATURE → facilitator settles → 200 + the plan
client → marketplace:  POST /agents/best/rating
```

Consequences, all fine but worth stating:

- **There is no standalone receipt step.** The agent doesn't verify a tx hash we hand it — the
  facilitator settles as part of the request. Less for us to build.
- **The seller quotes the price**, in its 402 challenge. The marketplace listing mirrors it
  (6.2: assume always in sync for the demo).
- **Neither wallet needs MON** — the facilitator pays gas. Verified: 0-MON buyer, 853ms.
- **Version trap** (from `open-questions.md`): `@x402/*` packages are v2; bare `x402-*` names are
  stale v1, and **Monad's facilitator is v2 only**. Headers are `PAYMENT-REQUIRED` /
  `PAYMENT-SIGNATURE`, not the v1 `X-PAYMENT` names.

## Resolved items

| # | Question | Answer |
|---|---|---|
| **1.1** | Two sides? | **Agent-to-agent.** |
| **1.2** | Unit of listing? | **An agent** — with rating and cost. Yelp for agents. |
| **1.3** | The transaction? | **Information.** One payment = one request. Micropayments on Monad. |
| **1.4** | Real or fiction? | **Solely simulated** sellers. |
| **2.1** | Scoped-card model? | **Tier 2, outside the marketplace.** |
| **2.2** | Seller payout? | Direct to the **agent's own wallet**, via x402 settlement. No intermediary. |
| **2.3** | Platform fee? | **None.** |
| **2.4** | On-chain? | **Payments on-chain only.** Registry is not (6.4). |
| **3.1** | Discovery? | Minimal — **return agents matching the requested type.** No ranking to build. |
| **3.2** | How does the buyer choose? | **Client-side concern.** |
| **3.3** | Reputation? | Client rates post-transaction. |
| **3.4** | Human in the loop? | **Tier 2 concern.** Marketplace path is autonomous. |
| **6.1** | Payment mechanism? | **x402 proper** — 402 challenge → EIP-3009 → facilitator settles. |
| **6.2** | Listed price authoritative? | **Yes** — assume listing and 402 challenge always agree. |
| **6.3** | Rating trust? | **Anyone can rate**, no proof-of-payment. Real-world version would bind it to a payment; not for this demo. |
| **6.4** | What is the marketplace? | **(b) An HTTP service** we run. Listings in memory/SQLite. Only payments touch chain. |
| **6.5** | Sellers separate? | **(b) In-process**, but with **real Monad testnet wallets**. *(See 7.1 — needs one refinement to work with x402.)* |
| **6.6** | Funding? | **Monad faucet — already done.** *(See 7.2 — check the asset.)* |
| **6.7** | Demo reaches tier 2? | **Yes, both.** Team split across the two functions. |
| **4.1** | Five travel domains? | **`search/hold/confirm/cancel` is dead — ignore it.** Search is the only real operation and is already being handled. *(Partially open — see 4.1 below.)* |
| **4.2** | Pitch? | *"Agents hire other agents — our marketplace lets an AI agent shop for the right specialist by price and rating, pay it per-question in on-chain micropayments, and spend real money on the result."* |
| **5.1** | Primary view? | **Node-link canvas** (React Flow). Agents as nodes, payments as edges. |
| **5.2** | Viewer? | **God-view.** Whole graph visible. |
| **5.3** | Live or replay? | **LIVE.** |
| **5.4** | Stack? | My call: **Vite + React + TypeScript + React Flow**, dark theme (`#0B0F19`/`#111827`), fed by **SSE** from the Node service. Server framework picked to match whatever `@x402/*` ships middleware for. |

---

# Follow-ups

Raised by this round of answers.

### 7.1 x402 needs an HTTP server; 6.5(b) says in-process objects 🔴

These two answers pull against each other. **x402 is an HTTP protocol** — the seller must return a
real `402` response with a challenge, and the client must retry against a real endpoint. In-process
objects have nothing to return a 402 *from*.

The cheap reconciliation, which I think is what you meant: **one Node process, N HTTP routes.**
Each seller agent is a route (`/agents/good`, `/agents/better`, `/agents/best`) with its own wallet
and its own persona, wrapped in x402 middleware. One process to launch, one thing to debug — but
real HTTP, real 402s, real wallet-to-wallet settlement.

That satisfies "in-process" (one program, one command) *and* "real Monad testnet wallets" *and*
x402. Confirm this is the reading, or tell me you'd rather drop x402 back to the custom
receipt flow from 1.2.

> **A:** you are correct with you  assumption here

---

### 7.2 Do the funded wallets hold USDC, or only MON? 🔴

You said the Monad faucet funding is done. Worth double-checking *which asset*, because x402 pays
in **USDC**, not MON:

- The **Monad faucet** dispenses **MON** (the gas token).
- x402 settles **testnet USDC** — `0x534b…43A3`, 6 decimals — and `open-questions.md` notes
  **Circle's faucet** (20 USDC / 2h / address) as the USDC source.
- Because the facilitator pays gas, **MON is the token we don't need** and USDC is the one we do.

If the wallets are MON-funded only, no payment will settle. Quick check, potentially saves an hour
of confusing failures. Also from `open-questions.md`: Monad defers execution ~0.9s, so **don't
fund-then-spend in one script.**

> **A:**I misunderstood this - apparently it should actually be USDC.

---

### 7.3 Are ratings pre-seeded? 🟡

6.3 settled *who* can rate, but not what's on screen at t=0. With a live god-view canvas, if all
three agents start unrated, the good/better/best tradeoff — the demo's central idea — is invisible
in the opening shot, and only one rating gets written during the run.

Assumption unless you object: **seed the trio with plausible rating histories** (e.g. 4.9★/312,
4.4★/1.1k, 3.8★/89) so the price-vs-rating tension is legible immediately, and the client's
post-run rating visibly moves a number that already exists.

> **A:** yes

---

### 7.4 What does a seller agent actually do inside? 🟡

4.1 says search "is being handled" — I don't know by whom or what it returns. For the marketplace
build I need the seller's **output contract**: given a query, what shape comes back?

Strawman: `{ recommendation, reasoning, options[], confidence }`, where options carry enough detail
(vendor, merchant name, amount in cents) for tier 2 to charge a Rain card against. Tier 2's
`trip.ts` already expects `vendor`, `vendorUrl`, `maxSpend`, `merchantAllowlist`, `payable` — so if
the seller emits those field names, the two tiers snap together with no adapter.

Is that safe to assume, or is the search work returning something else?

**✅ RESOLVED — the contract is `examples/trip.paris.json`.** Seller agents emit `LineItem`s; the
client agent assembles them into a `TripRequest`. See *The handoff contract* above. My strawman
guessed 5 of the 7 fields; the real shape adds `id`, `domain`, and `label`.

> **A:** the seller agent will be naive for now.  We don't really need to evalue the output, we just need the agent to be scored.  This can be deliverd FROM the agent as part of it's payload for demo.  IOW: "I'm the hotel agent.  The hotel I send you does not make you happy"

---

### 7.5 How do good / better / best actually differ? 🟡

The trio is the demo's whole point, so the difference has to be *visible*, not just a price label.
Options: response quality (best returns richer, better-reasoned picks), latency (cheap agent is
slow), number of options returned, or model tier behind each.

Cheapest convincing version: different system prompts + different model tiers, so best genuinely
returns a better answer for more money.

> **A:** just response uality, and for the demo, the agent will return a probabilitic value that stats it's response quality.

---

### 7.6 Does the existing tier-2 code survive intact? ⚪️

4.1 killed `search/hold/confirm/cancel` and the five `domain/<x>/booking.ts` stubs. Confirming the
inverse: **`trip.ts`, `allocator.ts`, `scope-cards.ts`, and `integrations/rain/` stay** — they're
tier 2, they're tested, and 6.7 puts tier 2 in the demo.

If so, `src/domain/{flights,hotels,activities,transport,dining}/` and `src/api/routes/` can be
deleted outright, which removes a lot of misleading scaffolding.

> **A:** _(unanswered)_

---

# Still open

### 4.1 (remainder) How many agent categories are live? 🔴

The dead-interface half is settled. Still unanswered: does the demo run **one** category with the
good/better/best trio, or several (hotel agents *and* flight agents *and* …)?

**✅ ANSWERED — three categories, three agents each: flights, hotels, car (`transport`).**
Nine seller agents. `dining` and `activities` are out of the demo. Shopping deliberation happens in
every category, not just one. Spec'd in `docs/tier1-display-spec.md`.

_(Superseded analysis below, kept for the reasoning.)_

**⚠️ `trip.paris.json` as the handoff contract reverses my earlier leaning.** That example carries
**five items across all five domains** — flights, hotels, transport, dining, activities. If tier 1's
job is to produce *that* object, the client agent has to consult a seller in **every** domain, or
the trip it assembles is a fragment. "One category live" would mean shrinking the demo trip to a
single hotel line, which throws away the allocator, the per-domain scoped cards, and most of what
tier 2 already does well.

**Revised recommendation — asymmetric coverage:**

| Domain | Agents listed | Shopped? |
|---|---|---|
| **hotels** | 3 — good / better / best | ✅ the shopping moment |
| flights, transport, dining, activities | 1 each | ❌ one obvious choice, paid, no deliberation |

Five categories live, so the trip JSON comes out complete and tier 2 gets a real five-domain
allocation — but the price-vs-rating deliberation happens **once**, where the camera is. Seven
seller agents total, six of them trivial. Cost is ~4 extra naive routes and 4 more funded wallets.

> **A:** _(unanswered)_

---

### 4.3 What is the demo, beat by beat? 🔴

Now unblocked — 6.7 (both tiers), 5.1 (canvas), 5.3 (live) are all decided. I can draft this if
you'd rather react than write.

Rough shape: user goal in → marketplace queried, three agents appear on canvas with ratings/prices
→ client agent deliberates and picks → 402 challenge → payment edge lights up, settles on-chain
(~1–2s, tx hash on screen) → plan returns → **the beat**: tier-2 handoff, Rain card charges the
real merchant → client rates the agent.

> **A:** _(unanswered)_

---

### 4.4 Who's building what? 🔴

Upgraded from 🟡. 6.7 says you split the team across the two tiers, but the split isn't written
down, and **a live React Flow canvas plus the SSE layer it needs is a third workstream with no
named owner** — and `src/index.ts` is still a 2-line stub, so nothing serves HTTP today.

Who's on tier 1, who's on tier 2, and who's on the frontend?

> **A:** **Brian → Tier 1 DISPLAY** (the canvas — the "OMG THIS" in 5.1). Spec:
> `docs/tier1-display-spec.md`. Tier 1 backend and tier 2 owners still unnamed here — the display
> needs a `GET /events` SSE endpoint from tier 1 backend, and nobody currently owns emitting the
> `tier2.*` events.

---

## Related

- `docs/open-questions.md` — Rain/Monad roles, x402 v1/v2 trap, Monad nonce hazard, error vocabulary
- `docs/budget-backend.md` — the scoped-card settlement spine that already works (tier 2)
- `PREVIOUS_HACKATHON_WINNERS.md` — UX/UI playbook from prior winning entries
