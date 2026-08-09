# API Contracts

The coordination point between teams: what the marketplace exposes, what's real
today, and what still has to be built.

**Status key:** ✅ exists and is fine · ⚠️ exists but wrong/misleading · ❌ missing

Base path is `/api`. Everything is JSON. The Vite dev server proxies `/api` to
`:3000`, so the browser only ever talks to one origin.

---

## Agent identity — a key and a name

Agents are addressed by **UUID**, never by name. A name is display data: it can
change, it collides, and it has no business being a primary key.

| Field | | |
|---|---|---|
| `agentId` | `51738b18-927a-47b0-80e9-d8659c6363cf` | **the key.** Opaque, stable, what every endpoint and event uses |
| `name` | `booking.com` | the agent's name — which *is* the merchant it fronts |

That's the whole identity. Agents are named for the vendor they represent, so the
name does double duty: it's what a human reads on the card, **and** it's what fills
`LineItem.vendor`, `merchantAllowlist[0]` and the basis for `vendorUrl` when the
seller answers. No separate `vendor` field — one name, one mapping.

**The UUIDs are hardcoded in the seed, deliberately.** Generating them at seed time
would give every teammate different ids, change them on every re-seed, and break any
id a test or the CLI agent hardcodes. These are the ids, permanently:

```
5911db48-8fe0-4b04-a9d3-4f3a5aa6c38e  kayak.com        flight
dcd84bff-d8f3-4ef0-a558-fcd64d9ad3c7  priceline.com    flight
11c130ef-a81c-4e61-9419-86f9f20d63ad  united.com       flight
51738b18-927a-47b0-80e9-d8659c6363cf  booking.com      hotel
6e60082b-9a2d-4f21-a072-e3e11eacaee6  hotels.com       hotel
eef6a007-0258-4866-b68c-947f7348e9c0  expedia.com      hotel
04aefebd-7520-4855-b9af-d8259bd90feb  hertz.com        car
4673637b-fe3a-49f6-bf5a-4053b9bc7d0f  avis.com         car
02bd8f54-cb60-418a-a5dc-0d4f30853fc1  enterprise.com   car
```

⚠️ **The event log gets less readable.** `agentId` in `client.select`,
`payment.settled` etc. is now a UUID, so anything rendering it raw shows
`dcd84bff…` instead of `priceline.com`. Displays must join through
`marketplace.results` to get `name` — the canvas already does for cards, but raw
event views need it too.

---

## The whole client-agent path

Four calls per category, then one handoff. If you're writing the CLI agent, this is
the entire surface you need:

```
GET  /api/agents?type=hotel                        → who's selling, at what price and rating
POST /api/agents/51738b18-…-d8659c6363cf/query      → pay (x402, later) and get one LineItem
POST /api/agents/51738b18-…-d8659c6363cf/rating     → write back what it was worth
                        ...repeat per category, collect the LineItems...
POST /api/trip/settle                              → hand the assembled TripRequest to tier 2
```

You get the UUIDs from `GET /api/agents` — never construct or assume them.

All five exist. **But the real client agent doesn't use them** — see the MCP section
below, which is the actual integration path.

---

## 0. MCP — how the real client agent connects

`rain-cli` is a general-purpose terminal coding agent. It has no marketplace code and
isn't going to grow any: it's an **MCP client**. So the marketplace is exposed as MCP
tools at **`POST /api/mcp`** (Streamable HTTP, stateless), and an LLM does the shopping.

```
bun run src/index.ts          # in the rain-cli repo; needs Bun and a real TTY
> /mcp                        # menu → [ Add ] → name: marketplace
                              #                  link: http://localhost:3000/api/mcp
> /mcp                        # again → Enter on "marketplace" to connect
> Book me a week in Paris for two in March, under $1,800.
```

`/mcp` is an interactive menu, not a subcommand — Add opens a two-field form (name,
link), and pressing Enter on a listed server connects it.

| Tool | Emits |
|---|---|
| `start_trip_run(goal, budgetUsd, categories?)` | `run.started` — and **we** fix the caps |
| `list_agents(category)` | `marketplace.query`, `marketplace.results` |
| `hire_agent(agentId, reasoning)` | `client.deliberate`, `client.select`, `payment.*`, `agent.response` |
| `rate_agent(agentId, stars)` | `client.rating` |
| `settle_trip()` | `trip.assembled`, `allocation.*`, `tier2.*`, `run.complete` |
| `trip_status()` | — |

**Three properties this buys, and they're the reason it beats a bespoke client:**

1. **The events are ours.** These handlers run in our process, so we emit everything.
   The client repo needs no knowledge of the event contract, no shared types, no
   `POST /api/events/emit`. Nothing can drift.
2. **The reasoning is real.** `reasoning` is a *required* argument of `hire_agent` — an
   agent cannot spend money without saying why — and it renders verbatim on the canvas.
3. **The agent never holds a `TripRequest`.** `hire_agent` accumulates `LineItem`s
   server-side and `settle_trip` takes no arguments, so the LLM cannot produce an
   invalid trip, mangle a payload, or lose an item to its context window. It
   orchestrates; the server owns the money, the caps and the validation.

`npm run mcp:drive` walks the same tools over the same transport with hardcoded
choices — rain-cli needs Bun, an API key and a TTY, so this is how the MCP path gets
tested and rehearsed without it.

⚠️ MCP tools in rain-cli are **auto-allowed** — no permission prompt. The agent spends
without confirmation. Fine for a demo; know it.

---

## 1. Discovery

### ✅ `GET /api/agents`

The directory. Returns the stats snapshot:

```ts
{
  agents: [{
    agentId,                          // UUID — the key
    name,                             // "booking.com" — display AND LineItem.vendor
    type,                             // SINGULAR: "flight" | "hotel" | "car"
    rating, ratingCount,              // the agent's own reputation
    priceUsdc,                        // charge per query, USDC — the only price field
    qualityPercent,                   // 0–100 advertised (agent.response.quality is 0–1)
    wallet,                           // x402 payTo — a real EIP-55 address.
                                      // Receive-only: only the BUYER needs funding.
  }],
  totalAgents, averageRating, ratingEndpointCalls
}
```

⚠️ The response also still contains **`avgRating` and `ratingCalls`, which are not
part of this contract — don't read them.** `avgRating` is the average across every
agent *of that type*, so `booking.com` reports `avgRating: 4.375` while its own
`rating` is `4.9`. It reads like the agent's rating and isn't. Both should come out
of the response (see the inconsistencies list).

### ✅ `GET /api/agents?type=hotel`

Server-side filtering. Same response shape as unfiltered, so callers never branch —
which does mean `totalAgents` and `averageRating` describe the **result set**, not
the whole marketplace, when a filter is applied.

- Accepts **singular or plural** (`hotel` / `hotels`), case- and
  whitespace-insensitive. The trip domains are plural and the agent types are
  singular; making callers remember which is which is a waste of a night.
- An **unknown type is a `400`** carrying the valid values, not an empty array. With
  three legal values, a silent `[]` makes a typo indistinguishable from "no agents of
  that kind".

### ✅ `GET /api/agents/:agentId`

One listing, by UUID (a name is also accepted, for hand-testing). Returns
`{ agentId, name, type, rating, ratingCount, priceUsdc, wallet }` — **never
`qualityPercent`.** 404 for an unknown agent.

### 🪦 `POST /api/agent_type/search` — deleted

Replaced by `GET /api/agents?type=`. It was a POST for a read, snake_case where
nothing else is, and returned agents in a *different shape* from `GET /api/agents` —
two endpoints, two shapes, one job. Returns 404, and a test asserts it stays that
way.

---

## 2. Query — the call that costs money

### ✅ `POST /api/agents/:agentId/query`

The seller. One payment buys one answer (question 1.3).

```ts
// request  (all optional; the seller is naive by design — question 7.4)
{
  goal?: string,
  capCents?: number,   // tell the seller the budget and it quotes inside it
  seed?: number,       // pin the quality draw for this one call
}

// response
{
  agentId: "51738b18-927a-47b0-80e9-d8659c6363cf",
  name: "booking.com",
  quality: 0.87,       // 0–1, DRAWN — see below
  lineItem: { id, domain, label, vendor, vendorUrl, maxSpend, merchantAllowlist, payable }
}
```

**`quality` is a draw, not a constant.** It's a truncated normal centred on the
agent's `qualityPercent` with σ = 0.08, so a good agent usually delivers and
sometimes disappoints, and a weak one occasionally gets lucky. A fixed score made
reputation meaningless — there was nothing for a rating to average over.

**Reproducibility:** `seed` in the body pins one call; `QUALITY_SEED=42` on the
server pins every call, so a whole rehearsal repeats identically. Streams are derived
from *(seed, agentId)*, not from one shared sequence — a single stream is only
reproducible for the life of the process, so run #2 would differ from run #1.

**A bad draw can never fail the run.** A worse answer costs more, but the quote is
clamped to `capCents` when you supply it. A rejected allocation is a beat to stage
deliberately, not one to leave to chance in front of judges — so a rejection is only
reachable by *not* telling the seller the cap. The caller's domain caps must also sum
to **less than** the budget, or the worst case (every item on its cap) fails
allocation; the harness asserts this at startup.

**The client owns `id` and `domain`; the seller owns the rest.** Item ids must be
unique across the assembled trip, and the client is what holds the
`type → domain` mapping. The seller fills both with defensible values so the
response validates standalone — overwrite them.

**The client must normalise `maxSpend.currency`** to the trip's currency. One seller
quoting EUR otherwise fails the whole trip at the boundary with an error naming
nobody.

**Validate each `LineItem` on arrival** with `LineItemSchema`. That turns a bad
seller into *"expedia.com returned an invalid item"* instead of a zod dump on the
assembled trip.

**This is the endpoint x402 wraps.** When it lands: the first call returns `402` with
a challenge, the retry carries `PAYMENT-SIGNATURE`, and the facilitator settles.
Nothing about the request or response shape changes.

---

## 3. Rating

### ⚠️ `POST /api/agents/rating` — superseded, use `/agents/:agentId/rating`

Still mounted (a test depends on it) but it cannot do the job:

```ts
{ agentType: "hotel", rating: 5 }   // agentId is accepted and then IGNORED
```

Three defects, verified by calling it:

1. **Keyed by type, not agent.** It buckets into `"hotel"`, so rating one hotel agent
   moves all three identically.
2. **The agent's own `rating` never changes.** It stays at the seeded value; only the
   type-level `avgRating` moves.
3. **In-memory only.** `inMemoryAgentStats` never reaches disk, so a restart wipes
   every rating.

Consequence: reputation cannot accumulate. That blocks the swarm entirely, and it's
why the rating write-back currently visible on the canvas is computed client-side by
the harness rather than read back from the server.

### ✅ `POST /api/agents/:agentId/rating`

```ts
// request
{ stars: 1..5 }        // `rating` / `score` also accepted

// response — the agent's updated reputation
{ agentId, name, rating, ratingCount }
```

Folds into **that agent's** `rating`/`ratingCount` and persists to
`data/agents.json`, so reputation accumulates across runs and survives a restart.
Out-of-range or non-numeric stars → 400; unknown agent → 404.

Writes are **serialised**. It's a read-modify-write on a JSON file, so concurrent
raters would otherwise lose votes — two readers both see `count=8`, both write `9`,
one rating vanishes. That matters for the swarm, which is nothing but concurrent
raters.

**This is what makes reputation causal rather than cosmetic.** Demonstrated over 14
consecutive runs: `hotels.com` was hired repeatedly, delivered ~0.79 quality each
time, and its rating decayed 4.4 → 4.19 — at which point the client switched to
`booking.com` and paid 1.8× more, because the cheaper agent had proven worse. Nothing
scripted that; the value function was simply fed newer numbers.

⚠️ **Keep `ratingCount` seeds small (6–24).** A 1dp display only moves when
`(stars − rating) / (count + 1) ≥ 0.05`, so a 4.4★ agent needs `count ≤ 11` for a
5★ to shift the number at all. Seed in the hundreds and reputation becomes
invisible — and the swarm loses the ability to shift a selection.

---

## 4. Trip handoff to tier 2

This is where the gap is. Tier 2 works — `allocate()` and `provisionAndSettle()` are
built and tested — but neither is exposed over HTTP, so only in-process callers can
reach it.

### ✅ `POST /api/trip/plan` — dry run

```ts
// request:  a full TripRequest (src/domain/shared/trip.ts)
// 200 → { ok: true,  plan: BudgetPlan }
// 422 → { ok: false, reasons: string[] }   // EVERY violated rule, not just the first
```

Lets the client check a plan before committing. Also the honest place to surface a
rejection: an agent recommending something over its domain cap gets refused here.

### ✅ `POST /api/trip/settle` — the real handoff

`allocate()` → `provisionAndSettle()` → `SettlementReport`. Emits `trip.assembled`,
`allocation.ok` / `allocation.failed`, `tier2.card_issued`, `tier2.charge`.

**A rejected allocation must not provision cards.** Stop at the allocator and return
422. Issuing Rain cards against a plan the allocator refused would be the worst
possible bug to demo.

Rain mode comes from `RAIN_*` env via `makeRainClient()` — mock unless configured,
so live Rain is a config change, not a code change.

### ⚠️ `POST /api/trip/variants`

`{ count, agentType }` → N clones of `examples/trip.paris.json` with bumped ids and
inflated caps. Full 5-domain trips from a static file. This is the static-JSON
approach we rejected: the point is that **sellers produce the items**, so tier 1
causes what tier 2 spends. Useful for load-testing the allocator; not part of the
demo path. Flagging rather than deleting in case it's load-bearing for someone.

---

## 5. Demo control

### ✅ Event stream — see `docs/tier1-events.md`

| | |
|---|---|
| `GET /api/events` | SSE. Replays the ring buffer, then follows live. |
| `GET /api/events/history` | JSON snapshot, for debugging. |
| `POST /api/events/reset` | Clear the buffer between runs. |
| `POST /api/events/emit` | Emit over HTTP instead of importing the bus. |

⚠️ The bus is **per-process**. A separate process (script, CLI agent) must use
`POST /api/events/emit` — an in-process `emit()` publishes into memory no browser is
subscribed to, and the run looks successful against a blank canvas.

### ✅ `POST /api/marketplace/reset`

Restore every rating to its seeded value → `{ ok: true, agents: [...] }`. Required
the moment ratings persist: otherwise each rehearsal starts wherever the last one
ended, and there's no way back to the state the demo was designed around.

### ✅ `GET /api/health` → `{ ok: true }`

---

## Naming inconsistencies worth fixing while it's cheap

- `id` (numeric, from the original seed) is now redundant alongside `agentId`. Kept
  for compatibility; nothing should read it.
- `avgRating` and `ratingCalls` should come **out** of the response. `avgRating` is a
  type-level aggregate that reads as the agent's own rating and isn't, and neither is
  part of the contract. Removing them breaks `tests/api/agent-type.test.ts`, which
  asserts both are present — that test needs updating in the same change.
- `priceUsdc` is a decimal number of USDC while tier 2 is integer cents everywhere.
  Inconsistent, but `priceUsdc` is in the published event contract and renaming it is
  a breaking change — documenting the seam rather than churning it.

## Dead — do not build against

`hold` / `confirm` / `cancel` were deleted, not deferred (question 4.1). `search()`
is the only provider operation. `/api/agent_type/{hold,confirm,cancel}` return 404
and a test asserts they keep doing so.

## Related

- `docs/tier1-events.md` — the event contract the endpoints emit
- `src/domain/shared/trip.ts` — `LineItem` / `TripRequest`, the handoff shapes
- `docs/marketplace-questions.md` — the decisions behind all of this
