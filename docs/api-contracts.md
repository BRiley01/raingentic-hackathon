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

Two of those five don't exist yet. **The trip handoff is the biggest gap** — right
now `allocate()` and `provisionAndSettle()` are only reachable in-process, so a CLI
agent in a separate process has no way to reach tier 2 at all.

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
    avgRating, ratingCalls,           // ⚠️ TYPE-level aggregate, not this agent's
    priceUsdc, price,                 // charge per query, USDC
    qualityPercent,                   // 0–100 advertised (agent.response.quality is 0–1)
    wallet,                           // x402 payTo — receive-only, needs no funding
  }],
  totalAgents, averageRating, ratingEndpointCalls
}
```

⚠️ **`avgRating` is a trap.** It's the average across every agent *of that type*, so
`booking.com` currently reports `avgRating: 4.375` while its own `rating` is `4.9`.
Read `rating`, never `avgRating`, when you mean "how good is this agent".

### ❌ `GET /api/agents?type=hotel`

Server-side filtering. Today every caller fetches all nine and filters locally.

### ❌ `GET /api/agents/:agentId`

One agent, by UUID. Needed to re-read reputation after rating it, and by the swarm.

### ⚠️ `POST /api/agent_type/search`

`{ agent_type: "hotels" }` → raw agent records (a *different* shape from
`GET /api/agents` — the stored record, not the snapshot). Accepts plural or
singular. Works, but it's a POST for a read, it's snake_case where nothing else is,
and it duplicates `GET /api/agents?type=`. **Recommend deprecating** once the query
param exists. Note its test pins **exactly 3 `flight` agents** — adding a fourth
breaks a test that looks unrelated.

---

## 2. Query — the call that costs money

### ✅ `POST /api/agents/:agentId/query`

The seller. One payment buys one answer (question 1.3).

```ts
// request  (both optional; the seller is naive by design — question 7.4)
{ goal?: string, capCents?: number }

// response
{
  agentId: "51738b18-927a-47b0-80e9-d8659c6363cf",
  name: "booking.com",
  quality: 0.91,        // 0–1, SELF-DECLARED. Nobody audits it; the client rates it.
  lineItem: { id, domain, label, vendor, vendorUrl, maxSpend, merchantAllowlist, payable }
}
```

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

### ⚠️ `POST /api/agents/rating` — exists, but cannot do the job

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

### ❌ `POST /api/agents/:agentId/rating` — what's needed

```ts
// request
{ stars: 1..5 }

// response — the agent's updated reputation
{ agentId, name, rating, ratingCount }
```

Must fold into that agent's `rating`/`ratingCount` and **persist to
`data/agents.json`**. Keep the type-level aggregate if something depends on it, but
*derive* it rather than store it.

⚠️ **Keep `ratingCount` seeds small (6–24).** A 1dp display only moves when
`(stars − rating) / (count + 1) ≥ 0.05`, so a 4.4★ agent needs `count ≤ 11` for a
5★ to shift the number at all. Seed in the hundreds and reputation becomes
invisible — and the swarm loses the ability to shift a selection.

---

## 4. Trip handoff to tier 2

This is where the gap is. Tier 2 works — `allocate()` and `provisionAndSettle()` are
built and tested — but neither is exposed over HTTP, so only in-process callers can
reach it.

### ❌ `POST /api/trip/plan` — dry run

```ts
// request:  a full TripRequest (src/domain/shared/trip.ts)
// 200 → { ok: true,  plan: BudgetPlan }
// 422 → { ok: false, reasons: string[] }   // EVERY violated rule, not just the first
```

Lets the client check a plan before committing. Also the honest place to surface a
rejection: an agent recommending something over its domain cap gets refused here.

### ❌ `POST /api/trip/settle` — the real handoff

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

### ❌ `POST /api/marketplace/reset`

Restore ratings to the seeded values. Needed to rehearse the same demo twice, and
essential for the swarm story ("let the market learn, reset, run again"). Today the
only reset is deleting `data/agents.json` and `data/.seed-version`.

### ✅ `GET /api/health` → `{ ok: true }`

---

## Naming inconsistencies worth fixing while it's cheap

- `POST /api/agents/rating` (collection-level, keyed by type) vs
  `POST /api/agents/:agentId/query` (resource-level, keyed by UUID). Rating should be
  `/api/agents/:agentId/rating`.
- `id` (numeric, from the original seed) is now redundant alongside `agentId`. Kept
  for compatibility; nothing should read it.
- `agent_type` is snake_case; nothing else is.
- `GET /api/agents` and `POST /api/agent_type/search` both return agents, **in
  different shapes**. One of them should go.
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
