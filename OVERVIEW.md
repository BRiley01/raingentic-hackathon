# Overview — for someone reading the code

**An AI agent hires other AI agents, pays them per answer in on-chain micropayments, and
then spends real money on what they told it.**

Two payment rails, because two different kinds of thing are being bought:

- **Information** — a specialist agent's recommendation. Paid for with **x402 USDC
  micropayments on Monad**, fractions of a dollar, one payment per question.
- **The actual trip** — flights, a hotel, a car. Paid for with **Rain scoped cards**, each
  locked to one merchant with its own spend limit.

Sub-dollar advice moves a ~$1,700 trip. That gap is the idea: a machine-to-machine market
where **price and reputation are the coordination mechanism**, and an agent has to decide
what good advice is worth before it can find out whether it got any.

---

## What's real

Not a mock. Verifiable while you read this:

**Real USDC settlement on Monad testnet.** Three settlements from one run:

```
0x0be1fffd9466b7593a845658cb1cf8941a8485fd44b8f75f4c6ad11a59ceaee6   block 52188247
0xa1987401fd8fa1dac45baa36e9e7a2980689fe782f7a596aaf7ae52342207b20   block 52188248
0xfcc4d66bd413dd96501feb8a21bb2629fef8afca01c2f6d09fc034525ebeb6d0   block 52188249
```

All `status=success`. Settlement in **232–371ms**. Seven of the nine seller agents now hold
USDC they earned — e.g. `kayak.com` at `0x25733a37…350a` holds 1.25 USDC, five separate
payments of $0.25. Look them up; the money is there.

**Payment is enforced, not decorated.** The seller endpoint is wrapped in x402 middleware
that runs *before* the handler:

| request | response | answer returned? |
|---|---|---|
| no payment | `402` + `PAYMENT-REQUIRED` challenge | no |
| forged `PAYMENT-SIGNATURE` | `402` | no |
| real EIP-3009 signature | `200` + the recommendation | yes |

An agent cannot be talked into answering for free. "One payment buys one request" is a
property of the system, not a promise in a README.

**A real LLM does the shopping.** The client is an MCP client
([rain-cli](https://github.com/aknlite48/rain-cli)); the marketplace is an MCP server. Claude
picks who to hire and has to justify it — `reasoning` is a *required* argument of
`hire_agent`, so the words on the display are the model's own:

> *"kayak.com rates half a star higher but charges twice as much per question. priceline's
> 4.4★ clears my bar for one round trip — I'd rather put the difference into the seat."*

**Reputation is causal, not cosmetic.** Ratings persist per agent. Over 14 consecutive runs,
`hotels.com` was hired repeatedly, delivered mediocre answers each time, and its rating
decayed 4.4 → 4.19 — at which point the client switched to `booking.com` and **paid 1.8×
more, because the cheaper agent had proven worse.** Nothing scripted that. The same value
function was simply fed newer numbers.

**Tier 2 really allocates and settles.** `allocate()` refuses any plan whose per-item caps
breach the budget or a domain cap, and reports *every* violated rule. Only then are scoped
cards issued — one per domain, each with a spend limit and a merchant allowlist — and each
payable line charged against its own card. A refused plan provisions nothing.

---

## Read the code in this order

~3,700 lines of TypeScript. Five files tell you almost everything:

**1. `src/events/types.ts`** — the event contract. One event stream describes an entire run.
Every other component is either a producer or a consumer of this.

**2. `src/mcp/server.ts`** — the six tools an LLM gets: `start_trip_run`, `list_agents`,
`hire_agent`, `rate_agent`, `settle_trip`, `trip_status`. The interesting decision is what
the model *isn't* trusted with — see below.

**3. `src/payments/x402.ts`** — both sides of a real payment. Nine paywalled routes generated
from the seed, one per agent with its own price and wallet; the buyer signs EIP-3009 and the
facilitator settles.

**4. `src/domain/shared/trip.ts` + `allocator.ts`** — the handoff. A zod-validated
`TripRequest` is the only artifact crossing from tier 1 to tier 2, and the allocator is the
guardrail that can refuse it.

**5. `web/src/state/graph.ts`** — the display, as a **pure fold over the event log**. No node
state is ever mutated. Refresh the browser mid-run and the graph rebuilds exactly, because
the server replays its ring buffer and the reducer runs again from the start.

---

## Design decisions worth noticing

**The LLM orchestrates; the server holds the artifacts.** `hire_agent` accumulates
`LineItem`s server-side and `settle_trip` takes *no arguments*. The model never touches a
`TripRequest`, so it cannot emit an invalid one, mangle a payload, or lose an item to its
context window — the three ways an LLM-driven demo dies in front of an audience.

**Budget caps are set before shopping, never derived from what came back.** If caps were
sized to fit the recommendations, the allocator could never refuse anything and the guardrail
would be unreachable. Caps first means "rejected for breaking the budget" is a real outcome.
It also means the client knows which line item is expensive enough to justify better advice.

**Answer quality is a random draw, not a constant.** An agent returning the same score
forever makes reputation meaningless — a rating has nothing to average over. Quality is drawn
around each agent's true quality, so a good agent sometimes disappoints and a weak one
sometimes gets lucky, and a rating becomes something earned.

**But a bad draw can never fail the run.** The seller clamps its quote to the cap it was
given, and the caps sum to less than the budget. A rejected allocation is a beat to stage
deliberately, not one to leave to chance in front of judges.

**Position bias was found and fixed.** The LLM was hiring the most expensive agent every
time. It turned out not to be price-blindness: the tool output was rating-sorted, and the
model was taking row 1. Evidence — when the top-listed agent changed, the choice changed with
it. The tool now presents in an order that carries no signal. The *display* stays
rating-sorted, because vertical position is a useful signal for a human across a room; a
ranked list is only a problem when the reader is the thing making the decision.

**Nothing is signalled by colour alone.** Every edge differs in shape and direction before
hue; every card states its state as a word. Green means settled on-chain, amber means
pending, crimson means halted — and never anything else.

---

## What's simulated, and how you can tell

Being straight about this is part of the design.

| | |
|---|---|
| Seller agents | **naive by design.** They don't really search. Each returns one recommendation plus a quality score standing in for evaluating the answer — which is what lets nine agents exist without nine real ones. |
| Ratings and prices | **synthetic.** Real company names, invented numbers. The display carries a permanent `simulated data` chip so nobody reads them as real assessments. |
| Rain settlement | **sandbox** unless `RAIN_*` credentials are set. Live Rain is a config change, not a code change. |
| x402 payments | **real when armed**, simulated otherwise — and simulated payments are labelled `SIMULATED PAYMENT` on the card with **no transaction hash**, because there is no transaction. Fabricating one would be the single most dishonest thing this codebase could do. |

The display never claims a settlement that didn't happen. That constraint is enforced in the
code, not in a convention: `txHash` is optional on `payment.settled`, and the UI shows chain
proof only when a real hash arrives.

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
reach the bus, because asserting the handlers in isolation would prove nothing about whether
an agent can actually talk to us.

Full endpoint and tool reference: [`docs/api-contracts.md`](docs/api-contracts.md).
Every decision and why: [`docs/marketplace-questions.md`](docs/marketplace-questions.md).
