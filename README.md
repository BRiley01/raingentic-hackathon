# Travel Booking Agent — Project Guide

A multi-agent travel booking platform. Each **booking domain** (flights, hotels, activities, ground transport, dining) is an independent, parallel workstream that plugs into a shared contract, so teams can build without stepping on each other.

---

## What we're building

An agent-driven travel experience. A user describes a trip; the system searches, holds, and books across five domains, then hands back a coherent plan. Under the hood, an LLM **orchestrator** routes each request to the right domain and stitches the results together.

The design goal is **breadth with consistency**: every booking type behaves the same way (search → hold → confirm → cancel), so adding a new domain later is a matter of filling in one interface, not reinventing the flow.

---

## The five domains

| Domain | What it does | Owner team |
|---|---|---|
| **Flights** | Search, price, hold, and book air travel | TBD |
| **Hotels** | Room search, availability, booking | TBD |
| **Activities** | Tours, tickets, experiences, passes | TBD |
| **Transport** | Rental cars, airport transfers, rail | TBD |
| **Dining** | Restaurant discovery + reservations | TBD |

Every domain implements the **same interface** (`search`, `hold`, `confirm`, `cancel`). Learn one, you know all five.

---

## Directory structure

```
travel-agent/
├── README.md
├── .env.example
├── .gitignore
├── package.json                 # or pyproject.toml
│
├── src/
│   ├── config/                  # env loading, API keys, constants
│   │   └── index.ts
│   │
│   ├── integrations/            # one folder per external API
│   │   ├── rain/                # auth + request wrapper + types
│   │   │   ├── client.ts
│   │   │   ├── types.ts
│   │   │   └── index.ts
│   │   └── monad/
│   │       ├── client.ts
│   │       ├── types.ts
│   │       └── index.ts
│   │
│   ├── agent/                   # the LLM decision layer
│   │   ├── tools/               # tool defs, one per domain capability
│   │   ├── prompts/
│   │   └── orchestrator.ts      # routes requests to the right domain
│   │
│   ├── domain/                  # core logic per booking type
│   │   ├── flights/
│   │   │   ├── search.ts
│   │   │   ├── booking.ts
│   │   │   └── types.ts
│   │   ├── hotels/              # (same three-file shape)
│   │   ├── activities/
│   │   ├── transport/          # rental cars, transfers, rail
│   │   ├── dining/             # discovery + reservations
│   │   └── shared/
│   │       ├── booking-base.ts  # the common search/hold/confirm interface
│   │       └── types.ts         # Money, DateRange, Location, Traveler
│   │
│   ├── api/                     # your own service endpoints
│   │   └── routes/
│   │       ├── flights.ts
│   │       ├── hotels.ts
│   │       ├── activities.ts
│   │       ├── transport.ts
│   │       └── dining.ts
│   │
│   └── shared/                  # utils, logging, error types
│
├── tests/
│   ├── integrations/
│   ├── domain/                  # one folder per domain
│   └── agent/
│
└── docs/
    ├── architecture.md
    └── api-contracts.md         # interface agreements between teams
```

---

## How the layers fit together

**`integrations/`** — Thin wrappers around external APIs (Rain, Monad). Each isolates auth and request handling for one provider. One team can own an integration without touching anyone else's. *Note: confirm what Rain and Monad each provide (payments? search? settlement?) before wiring them in — they map to different layers depending on their role.*

**`domain/`** — The business logic, one folder per booking type. Framework-agnostic and independently testable. This is where the five teams do most of their work.

**`domain/shared/booking-base.ts`** — The heart of the design. It defines one interface every booking type implements:

```
search(criteria)  → results
hold(selection)   → held booking (temporary)
confirm(hold)     → confirmed booking
cancel(booking)   → cancellation
```

Because all domains conform to this, the orchestrator treats them uniformly and teams build in parallel against a fixed contract.

**`agent/orchestrator.ts`** — The LLM layer. Interprets the user's request, decides which domain(s) to call, and sequences the results into a coherent trip.

**`api/`** — Your own HTTP endpoints, one route file per domain.

---

## Why this structure distributes cleanly

Each domain folder mirrors the same three-file shape (`search`, `booking`, `types`). Five teams, five parallel tracks, one shared contract in `domain/shared/`. A team owns its domain end-to-end — integration, logic, tests — without merge conflicts against other domains.

The coordination point is **`docs/api-contracts.md`**. Define the interfaces there first; then everyone builds against agreed shapes and integrates late instead of early.

---

## Getting started (per team)

1. Read `docs/architecture.md` and `docs/api-contracts.md`.
2. Look at `domain/shared/booking-base.ts` — this is the contract you implement.
3. Copy an existing domain folder as your template (all five share the same shape).
4. Fill in `search.ts`, `booking.ts`, `types.ts` for your domain.
5. Wire your provider calls through the relevant folder in `integrations/`.
6. Add tests under `tests/domain/<your-domain>/`.

---

## Open questions to resolve first

- **What do Rain and Monad actually provide?** Payments, search, identity, on-chain settlement? This determines where they sit in `integrations/` and which domains depend on them.
- **Payment & confirmation gating.** Autonomous charging is the riskiest step — decide where a human approval step lives before any real booking is confirmed.
- **Price/availability freshness.** Held selections go stale; the agent must re-check right before `confirm`.
