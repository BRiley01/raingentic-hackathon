# Architecture

See the root README for the full guide. In short:

- `integrations/` — external API wrappers (Rain, Monad)
- `domain/` — one folder per booking type, all implementing `domain/shared/booking-base.ts`
- `agent/` — LLM orchestrator that routes requests across domains
- `api/` — HTTP endpoints, one route file per domain

Every domain implements one operation: `search`. The old
`search → hold → confirm → cancel` lifecycle is **dead** (question 4.1) — the
methods and their tests are deleted. Money moves on the two rails instead: x402
micropayments for agent advice, Rain scoped cards for the trip.
