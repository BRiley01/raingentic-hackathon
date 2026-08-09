# API Contracts

The coordination point between teams. Agree on these shapes FIRST, then build in parallel.

## Booking contract (all domains)

Defined in `src/domain/shared/booking-base.ts`:

- `search(criteria) -> SearchResult[]`

**`hold` / `confirm` / `cancel` are dead — deleted, not deferred.** Search is the
only real operation (question 4.1). Payment happens on the two rails instead: x402
micropayments for advice, and Rain scoped cards for the trip itself, driven from a
`TripRequest`. Nothing should be built against a booking lifecycle.

## Per-domain criteria

Each domain defines its own `*Criteria` type in `domain/<domain>/types.ts`.

## Open questions

- What do Rain and Monad each provide? Determines integration mapping.

*(The `confirm`-gate and stale-hold questions that used to sit here are moot — that
interface no longer exists.)*
