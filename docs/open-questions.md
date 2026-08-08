https://docs.google.com/document/d/1XrwY5_6iR2QKS1ZqcfaDXySnbHwkBMAPawtip6GWVM0/edit?usp=sharing


# Open Questions

Decisions we need to make before (or early in) parallel build. Each one blocks or
reshapes work in a specific place, so the "Blocks" line matters as much as the question.

Status key: **Open** — undecided · **Leaning** — a default we'll use unless challenged · **Decided** — resolved, move it to `architecture.md` or `api-contracts.md`.

---

## 1. What do Rain and Monad actually provide?

**Status:** Open · **Blocks:** `src/integrations/`, every domain's `booking.ts`

Payments? Search? Identity? On-chain settlement? Their role determines which layer they
sit in and which domains depend on them. If either is a payment/settlement rail rather
than an inventory source, it belongs behind `confirm()` rather than `search()`.

- Which of the five domains get real inventory, and from where?
- Does either provider cover more than one domain, or do we need per-domain providers?
- Are there sandbox credentials for the hackathon? (`.env.example` has `RAIN_*` and `MONAD_*` slots but no documented base URLs.)

---

## 2. Where does human approval sit before `confirm()`?

**Status:** Open · **Blocks:** `agent/orchestrator.ts`, `api/routes/*`, `BookingProvider.confirm`

Autonomous charging is the riskiest step in the system. `booking-base.ts` marks
`confirm(holdId)` as the place to "gate real payment," but the gate itself is unbuilt.

- Is approval inside `confirm()` (provider refuses without an approval token) or in front of it (orchestrator never calls `confirm` unapproved)?
- One approval per booking, or one per trip covering several domains?
- What does the API return mid-approval — a pending state, or a blocking call?
- Do we need a spend ceiling as a backstop for the demo?

---

## 3. How do we handle stale holds and price drift?

**Status:** Open · **Blocks:** `BookingProvider.confirm`, orchestrator sequencing

`Hold.expiresAt` exists, but nothing re-checks it. Holds go stale and prices move between
`hold()` and `confirm()`.

- Re-search and compare before every `confirm`, or trust the hold until `expiresAt`?
- What's the tolerance — confirm anyway under some delta, or always re-prompt the user?
- Who owns the retry when a hold has already expired: domain or orchestrator?
- Multi-domain trips hold several things at once; if one expires, do we roll back the rest?

---

## 4. What happens when one leg of a multi-domain trip fails?

**Status:** Open · **Blocks:** `agent/orchestrator.ts`

A trip is only coherent if the pieces fit. A confirmed flight with a failed hotel is a
half-booked user.

- Is there a rollback path (`cancel()` the confirmed legs), or do we surface a partial trip?
- Does the orchestrator confirm sequentially (fail fast) or hold everything then confirm as a batch?
- Which failures are retryable vs. terminal?

---

## 5. Error and status vocabulary across domains

**Status:** Open · **Blocks:** `domain/shared/types.ts`, all five domains

`BookingStatus` is shared, but the failure vocabulary isn't. Five teams building in
parallel will invent five different error shapes unless we fix this first.

- What are the exact `BookingStatus` values, including expired/failed/pending-approval?
- One shared error type in `src/shared/`, or per-domain errors?
- How do provider errors map onto it — do we leak provider codes through `SearchResult.raw`?

---

## 6. Domain ownership

**Status:** Open · **Blocks:** parallel scheduling

The owner column in the README is `TBD` for all five domains. Until teams are assigned,
the parallel-workstream premise doesn't hold.

- Who owns flights, hotels, activities, transport, dining?
- Who owns the shared layers (`domain/shared/`, `agent/`, `integrations/`) that everyone depends on?

---

## 7. Demo scope

**Status:** Open · **Blocks:** how much any of the above matters

Hackathon reality check — which of these questions we actually need to answer depends on
how far the demo goes.

- Do all five domains need to work, or is depth in one or two more convincing than breadth in five?
- Mock providers for the domains without real inventory, or leave them unimplemented?
- Does the demo path touch real money at all? If not, questions 2 and 3 shrink considerably.

---

## Related

- `README.md` — full project guide
- `docs/architecture.md` — layer breakdown
- `docs/api-contracts.md` — interface agreements between teams
