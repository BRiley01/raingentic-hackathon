# Budget backend — scope cards + Rain sandbox settlement

The payment/allocation spine. Turns your team's trip JSON into one scoped Rain card
per agent, funds collateral, and settles each line item via the sandbox
authorize → settle flow.

Built against the **Raingentic hackathon starter kit** (Rain = raincards.xyz,
base URL `api-dev.raincards.xyz/v1`, `Api-Key` auth, sandbox only).

## Flow

```
trip JSON ─parse─► TripRequest ─allocate─► BudgetPlan ─provisionAndSettle─► SettlementReport
 (your team)        (validated)   (per-agent slices)   (fund + 1 card/agent +   (charges + report)
                                                        authorize→settle)
```

1. `domain/shared/trip.ts` — JSON contract + zod validation. `budget` is the hard
   ceiling; `domainCaps` optional per-domain; each item carries the `vendor` +
   `vendorUrl` your team picked, a `maxSpend` cap, `merchantAllowlist`, `payable`.
2. `domain/shared/allocator.ts` — pure, no network. Groups items by domain, sums
   caps into per-agent allocations, rejects (reporting all reasons) on any ceiling
   breach.
3. `domain/shared/scope-cards.ts` — uses your pre-provisioned `userId` +
   `contractId`, funds collateral, mints one scoped card per agent, then charges
   each payable item serially via authorize→settle.
4. `integrations/rain/client.ts` — `RainClient` with `LiveRainClient` (real
   sandbox HTTP) and `MockRainClient` (in-memory, enforces card limit locally).

## The starter-kit sandbox flow (what the live client implements)

| Step | Call |
|---|---|
| Fund collateral | `POST /simulate/collateral/fund` `{ contractId, currency:"rusd", amount }` (cents) |
| Issue scoped card | `POST /issuing/users/{userId}/cards/scoped` `{ amountInUSDCents }` — needs `sessionid` header; returned `id` is the cardId |
| Authorize | `POST /simulate/transactions/authorize` `{ cardId, amount, currency, merchantName, merchantCategoryCode }` |
| Settle | `POST /simulate/transactions/{id}/settle` |
| Read back | `GET /issuing/transactions?limit=20` (teamId scopes list endpoints) |
| Move money | `POST /payment-routes` then `POST /simulate/payment-routes` |

## Run

```bash
npm install
RAIN_MODE=mock npm run trip -- examples/trip.paris.json   # offline
npm test
npm run typecheck
```

## Go live

Put the workshop-desk credentials in `.env` (copy `.env.example`):

```
RAIN_MODE=live
RAIN_API_KEY=...
RAIN_USER_ID=...
RAIN_CONTRACT_ID=...
RAIN_TEAM_ID=...
RAIN_SESSION_ID=...     # required header for card issuance
```

Then the same `npm run trip` command runs against the sandbox.

## The one open item: sessionid

Card issuance needs a `sessionid` header. The starter kit says "needs a sessionid
header" but doesn't show how it's obtained. Get it from the sandbox playground
(`rain-sandbox-trial.mintlify.site`) or the workshop desk, then set
`RAIN_SESSION_ID`. Everything else is wired.

## Notes baked into the code

- Amounts are cents end-to-end (`amountInUSDCents`), matching the sandbox.
- Settlement is serialized (never Promise.all) — Monad drops concurrent-nonce writes.
- `z.record` over an enum key is exhaustive in zod 4 → `domainCaps` uses `partialRecord`.
- MCC per domain (airlines/lodging/car-rental/dining/recreation) sent on each charge.

## Next

- Vendor price re-check before charge (stale-hold freshness).
- Wire the five domains' `confirm()` stubs to call this settlement path.
- Optional: step-5 payment-routes for cross-rail money movement.
