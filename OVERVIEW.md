# Overview — for someone reading the code

**A marketplace where AI agents hire other AI agents, pay them per call in on-chain
micropayments, and rate them afterwards.**

Nothing about that is travel-specific. The marketplace's job is generic:

1. **Discover** — given a capability, return the agents that offer it, each with a price and
   a reputation.
2. **Pay** — one x402 USDC micropayment on Monad buys one call. No payment, no answer.
3. **Rate** — the caller scores what it got, and that score is what the *next* buyer sees.

That's the whole primitive. It works for anything an agent might want to buy from another
agent: research, code review, market data, legal summaries, image generation. **The caller
narrows the field on price versus reputation, and only finds out what it actually bought
after it has paid.** That tension is the interesting part, and it's domain-agnostic.

**Planning a trip is just the worked example.** We needed a domain that needs several
different specialists at once, where the answers have a natural second act — actually
spending money — so the demo could show both halves.

---

## The second half: advice becoming spend

Because the example has real purchases in it, there's a second rail:

| | Buying advice | Buying the thing |
|---|---|---|
| Who pays whom | client agent → seller agent's wallet | client agent → real merchant |
| Rail | **x402** micropayments on Monad | **Rain** scoped cards |
| Amount | fractions of a dollar | ~$1,700 |

**Sub-dollar advice moves a $1,700 purchase.** An agent spends $0.37 deciding *what* to buy,
then commits real money to the answer — through cards that are individually spend-limited and
locked to one merchant each, so a bad recommendation can't overspend even if it's followed.

---

## What's real

Not a mock. Checkable while you read this.

**Real USDC settlement on Monad testnet.** Three settlements from one run:

```
0x0be1fffd9466b7593a845658cb1cf8941a8485fd44b8f75f4c6ad11a59ceaee6   block 52188247
0xa1987401fd8fa1dac45baa36e9e7a2980689fe782f7a596aaf7ae52342207b20   block 52188248
0xfcc4d66bd413dd96501feb8a21bb2629fef8afca01c2f6d09fc034525ebeb6d0   block 52188249
```

All `status=success`, settling in **232–371ms**. Seven of the nine agents hold USDC they
earned — `0x25733a37…350a` holds 1.25 USDC, five separate payments of $0.25. Look it up.

**Payment is enforced, not decorated.** x402 middleware runs *before* the handler:

| request | response | answer returned? |
|---|---|---|
| no payment | `402` + `PAYMENT-REQUIRED` challenge | no |
| forged `PAYMENT-SIGNATURE` | `402` | no |
| real EIP-3009 signature | `200` + the answer | yes |

An agent cannot be talked into working for free. "One payment buys one call" is a property of
the system, not a promise in a README.

**A real LLM does the buying.** The client is an MCP client
([rain-cli](https://github.com/aknlite48/rain-cli)); the marketplace is an MCP server. Claude
chooses who to hire and must justify it — `reasoning` is a *required* argument of
`hire_agent`, so an agent cannot spend money without saying why, and the words on the display
are the model's own:

> *"kayak.com rates half a star higher but charges twice as much per question. priceline's
> 4.4★ clears my bar for one round trip — I'd rather put the difference into the seat."*

**Reputation is causal, not cosmetic.** Ratings persist per agent. Over 14 consecutive runs
one agent was hired repeatedly, delivered mediocre answers each time, and its rating decayed
4.4 → 4.19 — at which point the client switched to a **more expensive** competitor, because
the cheaper one had proven worse. Nothing scripted that. The same selection logic was simply
fed newer numbers. That is the marketplace working: a price signal and a quality signal, and
buyers moving between sellers as evidence accumulates.

---

## What's the platform, and what's the example

A judge reading the code will see `flight | hotel | car` and `TripRequest`, so here is
exactly where the line falls:

| Domain-agnostic | The travel example |
|---|---|
| `src/events/bus.ts` — zero domain references | `src/domain/shared/trip.ts` — the purchase schema |
| `src/payments/x402.ts` — discovery-agnostic settlement | `src/marketplace/seller.ts` — the catalogue of what agents sell |
| `src/agent/file-store.ts` — agent records + reputation | `src/domain/shared/allocator.ts` — budget → per-merchant cards |
| `GET /api/agents?type=` — discovery by capability | `src/trip/service.ts` — fulfilment |
| `POST /api/agents/:id/query` — paid invocation | the `flight/hotel/car` capability labels |
| `POST /api/agents/:id/rating` — reputation | the canvas's three columns |

**To point this at another domain** you would change the capability labels in
`agents.seed.ts`, the catalogue in `seller.ts` (what a seller returns), and either swap or
delete the fulfilment step in `src/trip/`. Discovery, pricing, x402 settlement, reputation,
the event stream and the agent display are untouched.

### What else this is, concretely

The same three primitives carry straight over. In each case the marketplace layer — the
directory, the paywall, the settlement, the reputation, the live view — is unchanged; what
changes is the capability labels and what a seller hands back:

**Building a website.** Capabilities become `design`, `copy`, `frontend`, `deploy`. The
caller hires a design agent, weighs three copywriters on rating versus price, pays each per
deliverable. The fulfilment half becomes a scoped card for the hosting bill and the domain
registrar — same guardrail, different merchants.

**Standing up a company.** Capabilities are roles: `incorporation`, `bookkeeping`,
`recruiting`, `brand`. An operator agent assembles a set of specialists under a budget, and
reputation is what stops it re-hiring the one that produced a bad filing. The per-role spend
caps and merchant allowlists are already exactly the right shape for this.

**Machine-payable infrastructure.** This is the most natural fit, and arguably what x402
exists for: capabilities are `inference`, `search`, `storage`, `market-data`. An agent
discovers providers, pays per call, and rates on latency and accuracy instead of stars.
Reputation becomes an SLA signal that emerges from usage rather than a contract. Drop the
fulfilment half entirely — there is nothing to buy afterwards, the API call *is* the purchase.

The honest measure of "how much work": for anything that's **paid calls plus reputation**,
it's the capability labels and the seller catalogue — small. If you also want the
**budgeted-spend second act**, you swap the purchase schema and the allocator's notion of a
line item, which is a real but bounded piece of work. The parts that took the longest to get
right — enforcing payment before delivery, making reputation accumulate and actually change
behaviour, and a display that can't lie about what settled — are the parts you keep.

**One place the example leaks:** the event contract carries `trip.assembled`,
`allocation.ok/failed` and `tier2.*`. Those are travel-shaped names on an otherwise generic
wire, and renaming them to something like `order.assembled` / `fulfilment.*` is the first
thing I'd do if this became a product. It's honest to point that out rather than claim the
whole thing is already domain-free.

---

## Read the code in this order

~3,700 lines of TypeScript. Five files tell you almost everything.

**1. `src/events/types.ts`** — the event contract. One stream describes an entire run;
everything else is a producer or a consumer of it. Zero domain logic.

**2. `src/mcp/server.ts`** — the six tools an LLM gets. The interesting decision is what the
model *isn't* trusted with (below).

**3. `src/payments/x402.ts`** — both sides of a real payment. Paywalled routes generated per
agent from the seed, each with its own price and wallet; the buyer signs EIP-3009 and the
facilitator settles.

**4. `src/agent/file-store.ts`** — reputation. Per-agent, persisted, serialised writes so
concurrent raters can't lose votes.

**5. `web/src/state/graph.ts`** — the display, as a **pure fold over the event log**. No node
state is ever mutated, so refreshing mid-run rebuilds the graph exactly: the server replays
its ring buffer and the reducer runs again from the start.

---

## Design decisions worth noticing

**The LLM orchestrates; the server holds the artifacts.** `hire_agent` accumulates results
server-side and the fulfilment tool takes *no arguments*. The model never handles the
composed purchase order, so it cannot emit an invalid one, mangle a payload, or lose an item
to its context window — the three ways an LLM-driven demo dies in front of an audience.

**Budget caps are set before buying, never derived from what came back.** Size the caps to fit
the recommendations and the guardrail can never fire. Caps first means "rejected for
breaking the budget" is a reachable outcome, and it tells the buyer which decision is
expensive enough to justify better advice.

**Answer quality is a random draw, not a constant.** A seller returning the same score
forever makes reputation meaningless — there is nothing for a rating to average over. Quality
is drawn around each agent's true quality, so a good agent sometimes disappoints and a weak
one sometimes gets lucky, and a rating becomes something earned.

**But a bad draw can never fail a run.** Sellers clamp their quote to the cap they were given,
and caps sum to less than the budget. A rejected plan is a beat to stage deliberately, not
one to leave to chance in front of judges.

**Position bias was found and fixed.** The LLM hired the most expensive agent every time. It
turned out not to be price-blindness: the tool output was rating-sorted and the model was
taking row 1 — proven by changing which agent sat top and watching the choice follow it. The
tool now presents in an order that carries no signal. The *display* stays rating-sorted,
because vertical position is a useful cue for a human across a room; a ranked list is only a
problem when the reader is the thing making the decision.

**Nothing is signalled by colour alone.** Every edge differs in shape and direction before
hue; every card states its state as a word. Green means settled on-chain, amber pending,
crimson halted — and never anything else.

---

## What's simulated, and how you can tell

Being straight about this is part of the design.

| | |
|---|---|
| Seller agents | **naive by design.** They don't really work the problem. Each returns one answer plus a quality score standing in for evaluating it — which is what lets nine agents exist without nine real ones. |
| Ratings and prices | **synthetic.** Real company names, invented numbers. The display carries a permanent `simulated data` chip so nobody reads them as real assessments. |
| Card issuance | **sandbox** unless Rain credentials are set. Live is a config change, not a code change. |
| x402 payments | **real when armed**, simulated otherwise — and a simulated payment is labelled `SIMULATED PAYMENT` on the card with **no transaction hash**, because there is no transaction. |

Fabricating a hash would be the single most dishonest thing this codebase could do, so the
constraint is enforced in the types rather than by convention: `txHash` is optional on
`payment.settled`, and chain proof renders only when a real one arrives.

---

## Run it in 60 seconds

No chain, no keys, no backend needed to see the whole story:

```bash
npm install && npm run dev            # :3000
cd web && npm install && npm run dev  # :5173 → open it
npm run simulate                      # a full run, ~30s
```

`npm test` — 45 tests. The one worth reading is `tests/api/mcp.test.ts`: it drives the MCP
server with a **real MCP client over Streamable HTTP** and asserts all fourteen event types
reach the bus, because testing the handlers in isolation would prove nothing about whether an
agent can actually talk to us.

Endpoints and tools: [`docs/api-contracts.md`](docs/api-contracts.md).
Every decision and why: [`docs/marketplace-questions.md`](docs/marketplace-questions.md).
