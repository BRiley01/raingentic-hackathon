# Architecture

See the root README for the full guide. In short:

- `integrations/` — external API wrappers (Rain, Monad)
- `domain/` — one folder per booking type, all implementing `domain/shared/booking-base.ts`
- `agent/` — LLM orchestrator that routes requests across domains
- `api/` — HTTP endpoints, one route file per domain

Every domain implements the same contract: search → hold → confirm → cancel.
