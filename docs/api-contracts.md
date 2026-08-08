# API Contracts

The coordination point between teams. Agree on these shapes FIRST, then build in parallel.

## Booking contract (all domains)

Defined in `src/domain/shared/booking-base.ts`:

- `search(criteria) -> SearchResult[]`
- `hold(resultId) -> Hold`
- `confirm(holdId) -> Booking`  (payment / human-approval gate lives here)
- `cancel(bookingId) -> Booking`

## Per-domain criteria

Each domain defines its own `*Criteria` type in `domain/<domain>/types.ts`.

## Open questions

- What do Rain and Monad each provide? Determines integration mapping.
- Where does the human approval step sit before `confirm`?
- How is stale-hold re-checking handled before `confirm`?
