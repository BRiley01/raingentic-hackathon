# Tier 1 Display — build spec

**Owner:** Brian · **Window:** tonight (Aug 8) · **Deliverable:** the live god-view canvas that
shows the agent marketplace transacting on-chain, in real time.

This is the demo's face. Tier 1 backend and tier 2 are other people's; this doc covers only the
display and the one thing it forces on everyone else — **the event contract**.

---

## 1. Scope

**In:**

- React Flow canvas — 9 seller agents, 1 client agent, 1 marketplace, 1 tier-2 sink
- **The event bus + `GET /api/events` SSE endpoint** — you own the transport, not just the consumer
- The `docs/tier1-events.md` contract (below) — **you own and publish this**
- A mock event emitter so the canvas is buildable and demoable with zero backend

**Out:** the marketplace service, the seller agents, x402 wiring, wallets, Rain settlement.
You *render* those; you don't build them.

**Owning both ends of the wire changes the shape of the job.** You no longer wait on anyone to
build an endpoint, and the ask you make of the tier-1 backend owner shrinks from *"build me an SSE
endpoint"* to *"call `emit('payment.settled', {…})` at these points."* That's a handful of
one-line insertions in their code. Publish the contract **and** the emitter together, and they can
adopt it without designing anything.

**The world on screen:**

| Category | Domain enum | Agents |
|---|---|---|
| Flights | `flights` | kayak.com · priceline.com · united.com |
| Hotels | `hotels` | booking.com · hotels.com · expedia.com |
| Car | `transport` | hertz.com · avis.com · enterprise.com |

**Agents are named for the vendor they represent — not for their tier.** There is no
"good/better/best" in the UI. Nothing in the name tells you which is best; **rating and price carry
100% of that signal.** That's a design constraint, not a detail — see §3.

Two things this buys us:

- **`vendor` comes free.** The agent's identity *is* `LineItem.vendor`, `merchantAllowlist[0]`, and
  the basis for `vendorUrl` — which is exactly the shape `examples/trip.paris.json` already uses
  (`kayak.com`, `booking.com`, `hertz.com`). Most of the `SearchResult → LineItem` mapping gap
  closes on its own.
- **Judges recognize the names**, so the marketplace reads as a real market at a glance instead of
  needing explanation.

Seeded ratings/quality are **synthetic**. Since these are real companies, put a small
`simulated data` chip in the header so nobody reads the numbers as real assessments.

⚠️ "Car" is `transport` in `trip.ts`'s domain enum. Render the friendly label, key on the enum.
`dining` and `activities` are out of the demo.

---

## 2. The event contract — do this first

**Highest-leverage 45 minutes of your night.** Write it, commit it, paste it in the team channel.
Until it exists, the backend owner is guessing and you're blocked; after it exists, you are both
free. It's the deliverable that unblocks two people.

Every event: `{ seq: number, ts: number, type: string, ...payload }`. `seq` is monotonic so the UI
can detect gaps and reorder.

```ts
// ---- discovery ----
'marketplace.query'    { queryId, category }
'marketplace.results'  { queryId, category, agents: [
                           { agentId, name, category, priceUsdc, rating, ratingCount, wallet } ] }

// ---- deliberation (the shopping moment) ----
'client.deliberate'    { queryId, considering: agentId[], reasoning }
'client.select'        { queryId, agentId, reason }

// ---- x402 payment ----
'payment.challenge'    { paymentId, agentId, amountUsdc, payTo, network: 'eip155:10143' }
'payment.signed'       { paymentId, agentId }
'payment.settled'      { paymentId, agentId, txHash, durationMs, explorerUrl }
'payment.failed'       { paymentId, agentId, reason }

// ---- the goods ----
'agent.response'       { queryId, agentId, quality, lineItem }   // lineItem = trip.ts LineItem
'client.rating'        { agentId, stars, newRating, newRatingCount }

// ---- handoff to tier 2 ----
'trip.assembled'       { tripId, trip }                           // full TripRequest
'allocation.failed'    { tripId, reasons: string[] }              // allocator's full reason list
'allocation.ok'        { tripId, allocations: [ { domain, allocatedCents, itemCount } ] }

// ---- tier 2 ----
'tier2.card_issued'    { domain, last4, limitCents, merchantAllowlist }
'tier2.charge'         { domain, vendor, amountCents, status: 'settled'|'declined'|'skipped' }

// ---- lifecycle ----
'run.started'          { runId, goal, budgetCents }
'run.complete'         { runId, ok, tier1SpentUsdc, tier2SettledCents }
```

**Non-negotiables to state when you publish it:** emit `payment.challenge` *before* signing (the
402 is a beat the audience needs to see), and include `txHash` + `explorerUrl` on settle — the
on-chain proof is the moment that convinces a judge.

### 2a. The bus + endpoint (yours)

Express already exists (`src/api/server.ts`, routes at `/api`), so this bolts on.

```ts
// src/events/bus.ts
type Listener = (e: DemoEvent) => void
const clients = new Set<Listener>()
const buffer: DemoEvent[] = []          // ring buffer, keep last ~500
let seq = 0

export function emit(type: string, payload: object) {
  const e = { seq: ++seq, ts: Date.now(), type, ...payload }
  buffer.push(e); if (buffer.length > 500) buffer.shift()
  for (const c of clients) c(e)
  return e
}
export function subscribe(fn: Listener) { clients.add(fn); return () => clients.delete(fn) }
export function since(n: number) { return buffer.filter(e => e.seq > n) }
```

```ts
// GET /api/events  — mounted in all-routes.ts
router.get('/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache',
            Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
  res.flushHeaders()
  const from = Number(req.headers['last-event-id'] ?? req.query.since ?? 0)
  const send = (e) => res.write(`id: ${e.seq}\ndata: ${JSON.stringify(e)}\n\n`)
  since(from).forEach(send)                       // replay what they missed
  const off = subscribe(send)
  const hb = setInterval(() => res.write(': ping\n\n'), 15_000)
  req.on('close', () => { off(); clearInterval(hb) })
})
```

Four details that matter more than they look:

- **The replay buffer is demo insurance.** Because the canvas is a reducer over the event log,
  `?since=0` rebuilds the entire run from scratch. Refresh the browser two minutes into a live
  demo and the graph comes back exactly as it was. Without it, a stray Cmd-R ends your demo.
- **`id:` on every event** makes `EventSource` auto-resume with `Last-Event-ID` on reconnect,
  for free.
- **The heartbeat** keeps proxies and sleeping laptops from silently dropping the stream.
- **`X-Accel-Buffering: no`** — without it some proxies buffer the stream and nothing appears
  until the run ends.

**Also expose `POST /api/events/replay`** (re-emit a canned run from a JSON file) — the same
mechanism as the mock, but driven server-side, so you can demo the real UI end-to-end even if the
chain misbehaves.

**Vite dev:** proxy `/api` to the Express port in `vite.config.ts` so you never touch CORS.

---

## 3. Canvas design

```
   ┌──────────┐        ┌─────────────┐        FLIGHTS       HOTELS        CAR
   │  GOAL    │───────▶│   CLIENT    │       ┌──────────┐ ┌──────────┐ ┌──────────┐
   │ Paris    │        │   AGENT     │──────▶│ kayak    │ │ booking  │ │ hertz    │
   │ $1,800   │        │             │       │ 4.9 ★    │ │ 4.9 ★    │ │ 4.6 ★    │
   └──────────┘        │  spent:     │──────▶│ priceline│ │ hotels   │ │ avis     │
                       │  $0.31      │       │ 4.4 ★    │ │ 4.4 ★    │ │ 4.1 ★    │
                       └──────┬──────┘──────▶│ united   │ │ expedia  │ │enterprise│
                              │              │ 3.8 ★    │ │ 3.8 ★    │ │ 3.5 ★    │
                              │              └──────────┘ └──────────┘ └──────────┘
                              │                    ▲ sorted by rating, desc
                       ┌──────▼──────┐
                       │ MARKETPLACE │  ◀── ratings written back
                       │ 9 listings  │
                       └──────┬──────┘
                              │  trip.assembled  (TripRequest)
                       ┌──────▼──────────────────────────┐
                       │ TIER 2 — RAIN                   │
                       │ [flights ····] [hotels ····]    │
                       │ [transport ····]   $1,714 settled│
                       └─────────────────────────────────┘
```

### Agent node

Everything a buyer would weigh, on the face of the card. **Because the name no longer encodes
tier, the rating has to do that work visually** — not just as a number:

```
┌─────────────────────────────┐
│ booking.com         ● PAID  │   ← state dot
│ ★★★★★ 4.9   (21)            │   ← filled bar, not just digits
│ $0.25 USDC                  │
│ 0xAB…f31                    │
│ ─────────────────────────── │
│ quality ▓▓▓▓▓▓▓▓░░  0.87    │   ← only after agent.response
└─────────────────────────────┘
```

Three rules that follow from names being tier-neutral:

- **Sort each column by rating, descending.** Vertical position becomes a free second signal.
- **Render the star rating as a filled bar**, so relative quality is legible at a glance from the
  back of a room — a "4.9" and a "3.8" look nearly identical as glyphs.
- **Price and rating get equal visual weight.** The tension between them is the whole decision;
  if price is small print, the deliberation beat doesn't read.

### States → color

Per `PREVIOUS_HACKATHON_WINNERS.md`: conservative color, reserved meanings.

| State | Trigger | Color |
|---|---|---|
| `idle` | default | slate, muted |
| `listed` | `marketplace.results` | slate + full opacity |
| `considered` | `client.deliberate` | white outline, subtle pulse |
| `quoted` | `payment.challenge` | **amber** — awaiting payment |
| `paying` | `payment.signed` | amber, edge animating |
| `paid` | `payment.settled` | **green** + tx hash chip |
| `responded` | `agent.response` | green + quality bar |
| `failed` | `payment.failed` | **crimson** |
| `rejected` | `allocation.failed` | **crimson**, on the offending domain |

Bases `#0B0F19` / `#111827`. Green *only* for settled, amber *only* for pending, crimson *only*
for a halt. Never decorative.

### Edges

- **Discovery** — client ⇄ marketplace, thin, dashed, fades after resolving
- **Payment** — client → agent, animated dots travelling the edge while `paying`, freezing green
  on settle with the tx hash as an edge label
- **Result** — agent → client, carries the `LineItem` label ("Hotel Ibis, 4 nights — $450 cap")
- **Rating** — client → marketplace, brief, with the star delta
- **Handoff** — client → tier 2, thick, fires once on `trip.assembled`

### The stat that lands

Persistent header, two numbers side by side:

```
   TIER 1 — advice        TIER 2 — the trip
   $0.31 USDC             $1,714.00
   9 agents · 3 paid      3 scoped cards
```

**Fractions of a cent bought the decisions; the decisions moved $1,714.** That juxtaposition *is*
the pitch (4.2), rendered. Make it big.

---

## 4. Build order

Roughly 6–7 hours. Each step ends somewhere demoable.

| # | Step | Est | Done when |
|---|---|---|---|
| 1 | **Publish the contract + bus** — `docs/tier1-events.md` and `src/events/bus.ts`, committed and posted | 60m | Backend owner can `emit()` today |
| 1b | `GET /api/events` SSE route + heartbeat + replay buffer | 45m | `curl localhost:3000/api/events` streams |
| 2 | Scaffold `web/` — Vite + React + TS + React Flow, dark theme tokens, `/api` proxy | 30m | Blank dark canvas renders |
| 3 | **Mock emitter** — `web/src/mock/run.ts`, scripted full run with realistic delays | 45m | Canvas can be driven with zero backend |
| 4 | Node components — Agent, Client, Marketplace, Tier2 | 90m | 12 nodes laid out, static data |
| 5 | Event→graph reducer — one `switch` over `type`, drives all node/edge state | 60m | Mock run animates end to end |
| 6 | Edge animation + payment beats + tx-hash chips | 60m | The payment moment reads well |
| 7 | Stat header + rating write-back animation | 45m | The two-number juxtaposition is on screen |
| 8 | Swap mock → real SSE (`?live=1` toggles source) | 30m | Works against backend when it lands |

**Keep the mock forever.** It's your demo insurance: if the backend, the facilitator, or the
testnet is unwell at showtime, `?mock=1` still tells the whole story. Do not let it rot — every
new event type gets added to the mock the same hour it's added to the reducer.

---

## 5. Decisions already made for you

- **Stack:** Vite + React + TypeScript + React Flow (5.4). Put it in `web/` — a separate
  `package.json`, so the frontend's deps never collide with the backend's.
- **Transport:** SSE, not WebSocket. One-way, trivially proxied, reconnects for free.
- **State:** one reducer over the event log — `events[] → graph`. Never mutate node state
  directly. Replay for free, and time-travel scrubbing becomes almost free if you want it later.
- **Layout:** fixed positions, not a force layout. Nine agents in three tidy columns beats a
  physics sim that jiggles on stage.

---

## 6. Risks

| Risk | Mitigation |
|---|---|
| Backend event stream lands late or differs | Mock emitter (step 3) — you're never blocked, and the contract is yours to hold them to |
| Live run fails on stage | `?mock=1` fallback, rehearsed |
| Settlement too fast to see (~1–2s) | Deliberately hold the `quoted` → `paying` transition ~600ms so the 402 beat registers |
| Nine nodes read as clutter | Only the active category is at full opacity; the other two dim |
| `transport` vs "car" naming drift | Key on the enum, label in the UI |

---

## 7. What you need from others

Much less than before, now that you own the transport.

- **Tier 1 backend owner:** import `emit` from `src/events/bus.ts` and call it at the points in §2.
  One line each, no design decisions. Everything else is yours.
- **Tier 1 backend owner (data):** add `priceUsdc` and `wallet` to the agent records in
  `src/agent/file-store.ts`, and seed 9 agents across `flights` / `hotels` / `transport` with the
  vendor names in §1. Without price and wallet there is nothing to shop on and nobody to pay.
- **Tier 2 owner:** either call `emit('tier2.card_issued' | 'tier2.charge', …)` from
  `scope-cards.ts`, or hand tier 1's runner the `SettlementReport` to emit on their behalf. Still
  unowned — settle it before building §3's tier-2 panel.

**If nobody wires `emit()` in time**, the canvas still runs the full story off the mock and
`POST /api/events/replay`. You are not on anyone's critical path.

---

## Related

- `docs/marketplace-questions.md` — every decision behind this
- `src/domain/shared/trip.ts` — `LineItem` / `TripRequest` shapes the events carry
- `PREVIOUS_HACKATHON_WINNERS.md` — the UX playbook this design follows
