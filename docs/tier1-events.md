# Demo Events — the contract

The wire format between the backend and the live canvas. **Source of truth is
`src/events/types.ts`** — this doc is the readable version.

Backend folks: you only need §1 and §3.

---

## 1. How to emit

```ts
import { emit } from "../events/bus.js";

emit("payment.settled", { paymentId, agentId, txHash, durationMs: 853 });
```

That's the whole API. Not async, never throws, costs nothing when no browser is connected, safe
to call from anywhere. `seq` and `ts` are stamped for you.

Not writing TypeScript? Same thing over HTTP:

```bash
curl -X POST localhost:3000/api/events/emit \
  -H 'Content-Type: application/json' \
  -d '{"type":"payment.settled","agentId":"booking.com","txHash":"0x…"}'
```

**Two requests, if you only remember two things:**

1. **Emit `payment.challenge` *before* signing.** The 402 is a beat the audience needs to see. If
   it arrives at the same moment as the settlement, the payment looks instantaneous and the most
   interesting part of the protocol is invisible.
2. **Always include `txHash` on `payment.settled`.** That's the on-chain proof, and it's the thing
   a judge leans in for.

---

## 2. Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/events` | SSE stream. Replays the buffer, then follows live. |
| `GET /api/events?since=42` | Same, replaying only events after `seq` 42. |
| `GET /api/events/history` | Plain JSON snapshot, no streaming. Handy for debugging. |
| `POST /api/events/emit` | Emit over HTTP instead of importing `emit`. |
| `POST /api/events/reset` | Clear the buffer between demo runs. |

Every event ships with an `id:` line, so browsers auto-resume via `Last-Event-ID` after a dropped
connection. The last 500 events stay buffered — which means **a mid-demo browser refresh rebuilds
the entire run** instead of ending it.

---

## 3. The events

Every event also carries `seq` (monotonic) and `ts` (epoch ms).

### Lifecycle

```ts
"run.started"    { runId, goal, budgetCents }
"run.complete"   { runId, ok, tier1SpentUsdc, tier2SettledCents }
```

### Discovery

```ts
"marketplace.query"    { queryId, category }            // category = flights | hotels | transport
"marketplace.results"  { queryId, category, agents: AgentListing[] }
```

```ts
AgentListing = {
  agentId, name,          // name is the vendor it fronts: "booking.com"
  category,               // trip.ts Domain enum
  priceUsdc,              // charge per question
  rating, ratingCount,    // 4.9, 312
  wallet,                 // x402 payTo
  qualityPercent?,        // advertised quality
}
```

### Deliberation — the shopping moment

```ts
"client.deliberate"  { queryId, considering: agentId[], reasoning? }
"client.select"      { queryId, agentId, reason? }
```

`reasoning` is rendered **verbatim** on the canvas. If the client agent produces any natural
language about why it's choosing, send it — watching an agent explain a spending decision in its
own words is worth more than any animation.

### x402 payment

```ts
"payment.challenge"  { paymentId, agentId, amountUsdc, payTo, network }  // network: "eip155:10143"
"payment.signed"     { paymentId, agentId }
"payment.settled"    { paymentId, agentId, txHash, durationMs, explorerUrl? }
"payment.failed"     { paymentId, agentId, reason }
```

### The goods

```ts
"agent.response"  { queryId, agentId, quality, lineItem }   // quality 0–1; lineItem = trip.ts LineItem
"client.rating"   { agentId, stars, newRating, newRatingCount }
```

### Handoff to tier 2

```ts
"trip.assembled"     { tripId, trip }                    // the full TripRequest
"allocation.ok"      { tripId, allocations: [{ domain, allocatedCents, itemCount }] }
"allocation.failed"  { tripId, reasons: string[] }       // every violated rule, not just the first
```

`allocation.failed` renders in crimson on the offending domain. An agent recommending something
that blows its budget cap, rejected live on screen, is a genuinely good demo beat — please don't
swallow it.

### Tier 2

```ts
"tier2.card_issued"  { domain, last4, limitCents, merchantAllowlist }
"tier2.charge"       { domain, vendor, amountCents, status, reason? }   // settled | declined | skipped
```

Everything in tier 2 is already in `SettlementReport` — if emitting is awkward, hand the report
over and it can be emitted on your behalf.

---

## 4. Compatibility

- **Adding a field is safe.** Unknown fields are carried through and ignored.
- **Renaming a field or a `type` is not.** The UI keys on `type`.
- Extra events the UI doesn't know about are ignored, never fatal. Emit freely.
- Missing optional fields degrade gracefully — a `payment.settled` with no `explorerUrl` just
  doesn't render a link.

---

## Related

- `src/events/types.ts` — source of truth
- `src/events/bus.ts` — the emitter
- `docs/tier1-display-spec.md` — what the canvas does with all this
