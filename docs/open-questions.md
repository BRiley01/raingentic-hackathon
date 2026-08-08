https://docs.google.com/document/d/1XrwY5_6iR2QKS1ZqcfaDXySnbHwkBMAPawtip6GWVM0/edit?usp=sharing


# Open Questions

Decisions we need to make before (or early in) parallel build. Each one blocks or
reshapes work in a specific place, so the "Blocks" line matters as much as the question.

Status key: **Open** — undecided · **Leaning** — a default we'll use unless challenged · **Decided** — resolved, move it to `architecture.md` or `api-contracts.md`.

---

## 1. What do Rain and Monad actually provide?

**Status:** **Answered** · **Blocks:** `src/integrations/`, every domain's `booking.ts`

Payments? Search? Identity? On-chain settlement? Their role determines which layer they
sit in and which domains depend on them. If either is a payment/settlement rail rather
than an inventory source, it belongs behind `confirm()` rather than `search()`.

▸ **Answered — both are payment rails. Neither supplies inventory.**

- **Rain** is stablecoin card-issuing infrastructure (Visa/Mastercard Principal Member). Its
  relevant feature is the **Agent Control Layer** — programmatic spend guardrails on a card an
  agent holds. It governs **card issuance and transaction initiation**, nothing else.
- **Monad** is an EVM L1 used as the settlement chain — chain ID **10143** (`0x279f`), gas token
  MON, ~300ms blocks. Testnet USDC is `0x534b…43A3`, 6 decimals, with **EIP-3009 present**.
- **x402** is the connective protocol: `GET` → server `402` with an `accepts[]` challenge
  (scheme / network `eip155:10143` / asset / **amount** / **payTo**) → buyer signs EIP-3009
  → retry → facilitator settles.
- The Monad facilitator (`x402-facilitator.molandak.org`) is live, **v2 only**, and **pays the
  gas**: a buyer holding **0 MON** completed a paid call in 853ms, with `tx.from` being the
  facilitator's signer. Neither wallet needs MON.

**Therefore, for our five domains:** none of flights, hotels, activities, transport, or dining
gets real inventory from Rain or Monad. Every domain needs either a third-party inventory
provider or a mock. `integrations/rain/` and `integrations/monad/` belong on the **payment**
path behind `confirm()` — they are not `search()` sources, and the current directory layout
implying otherwise is misleading.

**Credentials:** Rain has **no public self-serve sandbox** and its docs are gated behind an
access code; creds come from the organizers **Sat Aug 8, 11:30am** — this is the critical path.
Monad testnet RPC `testnet-rpc.monad.xyz` is live (not for production). The explorer moved:
`testnet.monadexplorer.com` **301 →** `testnet.monadvision.com`.

**Still open:** Monad is a confirmed supported Rain chain, but whether the *hackathon sandbox*
uses Monad **testnet or mainnet** is unknown — ask at 11:30.

---

## 2. Where does human approval sit before `confirm()`?

**Status:** **Partly answered** — one path is ruled out · **Blocks:** `agent/orchestrator.ts`, `api/routes/*`, `BookingProvider.confirm`

Autonomous charging is the riskiest step in the system. `booking-base.ts` marks
`confirm(holdId)` as the place to "gate real payment," but the gate itself is unbuilt.

▸ **Answered — you cannot ask Rain for permission in advance.**

- **No Rain pre-authorization / simulate / dry-run endpoint exists.** There is no "would this be
  allowed?" query. Rain **pushes** an authorization decision request to you by **webhook** when a
  real card swipe hits Visa. You do not pull. Any design that calls Rain to validate before
  `confirm()` is building against an API that isn't there.
- **x402 payments never traverse Rain.** Rain is structurally incapable of seeing a
  wallet-to-wallet USDC transfer on Monad. If we narrate "Rain approved the on-chain payment,"
  that is false and a judge from Rain is in the room.
- The Rain ACL **policy object** has these fields, which is the vocabulary any gate of ours
  should speak: `maxTransactionAmount`, `merchantAllowlist`, `categoryAllowlist`, `spendInterval`,
  `expiry`, `counterpartyAllowlist`.

**Still open (ours to decide):** whether approval lives inside `confirm()` or in front of it,
one approval per booking vs. per trip, what the API returns mid-approval, and the spend ceiling.

**Ask the organizers at 11:30:** pre-auth endpoint? Is the policy readable back over the API?
Are Partner-Managed webhooks available? Testnet or mainnet?

---

## 3. How do we handle stale holds and price drift?

**Status:** **Partly answered** — the protocol gives us a quote to bind to · **Blocks:** `BookingProvider.confirm`, orchestrator sequencing

`Hold.expiresAt` exists, but nothing re-checks it. Holds go stale and prices move between
`hold()` and `confirm()`.

▸ **Answered — x402 quotes amount and payee server-side, per resource.**

- The `402` challenge carries the authoritative **amount** and **payTo** for that resource. So on
  the payment rail, freshness has a natural mechanism: re-request the resource, compare the fresh
  challenge to what the hold was taken against. We don't have to invent a price-drift check for
  x402 spend — only for whatever inventory provider each domain uses.
- **Settlement is fast enough that re-quoting is cheap:** a settled, linkable payment lands in
  **~1–2s**. `eth_sendRawTransactionSync` (EIP-7966) returns the receipt in one call.
- **Watch the funding-then-spending gap:** Monad defers execution ~0.9s, so a newly funded
  account cannot immediately spend. Don't fund-then-spend in one script.

**Still open (ours):** tolerance for price delta on the *inventory* side, who owns the retry when
a hold has expired, and whether one expired hold rolls back the others.

---

## 4. What happens when one leg of a multi-domain trip fails?

**Status:** **Partly answered** — batch confirm is ruled out on the chain rail · **Blocks:** `agent/orchestrator.ts`

A trip is only coherent if the pieces fit. A confirmed flight with a failed hotel is a
half-booked user.

▸ **Answered — payments must be serialized. Never `Promise.all` them.**

This is the top-ranked stage risk on Monad, and it directly settles our
"sequential vs. batch confirm" question for anything touching the chain:

- `getTransactionCount("latest")` on Monad returns a count against a **speculative** block tag.
  Rapid concurrent payments therefore draw **duplicate nonces**, and the losing transactions are
  **silently dropped** — no error, no receipt, just a payment that never happened.
- The fix is mechanical: **serialize through one queue with a locally incremented nonce, never
  re-read the nonce mid-run.**

So a five-domain trip cannot fan out its `confirm()` calls concurrently. The orchestrator
confirms one leg at a time, which also means a failure has a well-defined set of
already-confirmed legs to reason about.

**Still open (ours):** whether we roll back confirmed legs via `cancel()` or surface a partial
trip, and which failures are retryable.

---

## 5. Error and status vocabulary across domains

**Status:** **Partly answered** · **Blocks:** `domain/shared/types.ts`, all five domains

`BookingStatus` is shared, but the failure vocabulary isn't. Five teams building in
parallel will invent five different error shapes unless we fix this first.

▸ **Answered — three concrete constraints on the enum and the error type.**

- **`pending` must be a real state, distinct from failed.** `eth_getTransactionByHash` returns
  **null while unconfirmed** — i.e. exactly during the window a user is watching. Treating "not
  found yet" as failure will report false failures on every booking.
- **Report every violated rule, don't short-circuit.** The earlier project found that
  first-failure-wins made two genuinely different violations render identically, erasing the
  distinction. Whatever validates a `confirm()` should return the full set of reasons.
- **Monad changed its revert-code shape:** `eth_call` codes moved from `-32603` to **`3`** (v0.15.0),
  which **breaks naive viem error handling**. Provider errors need explicit mapping; we cannot
  pass viem errors through and hope.

**Still open (ours):** the exact `BookingStatus` values, one shared error type vs. per-domain,
and whether provider codes leak through `SearchResult.raw`.

---

## 6. Domain ownership

**Status:** Open — nothing in the earlier project bears on this · **Blocks:** parallel scheduling

The owner column in the README is `TBD` for all five domains. Until teams are assigned,
the parallel-workstream premise doesn't hold.

- Who owns flights, hotels, activities, transport, dining?
- Who owns the shared layers (`domain/shared/`, `agent/`, `integrations/`) that everyone depends on?

---

## 7. Demo scope

**Status:** **Answered, and it's the uncomfortable one** · **Blocks:** how much any of the above matters

Hackathon reality check — which of these questions we actually need to answer depends on
how far the demo goes.

▸ **Answered — the schedule is the binding constraint, and it does not favor five domains.**

- **The event is Aug 8–9 2026, NYC. Today is Aug 8.** Build budget is **~14 hours**, and Rain
  creds don't land until **11:30am Saturday**.
- The earlier project scoped a **single** use case, had its payment rail and enforcement point
  **already built and verified on-chain**, and still concluded: *"The schedule does not close"* —
  12–14 hrs of remaining work against a ~14 hr budget, **16–20 hrs realistic**. This repo has five
  domains, all scaffolding, and no verified rail.
- **The judges** are product and infra people (Rain, Cursor/Origin, Dragonfly) and **reward a
  working, product-minded demo over a sprawling one.** The stated challenge is broad on purpose:
  *"build the best use case that uses Rain and involves agentic commerce."* Nothing requires five
  domains.
- **Funding is not a constraint** — Circle's faucet dispenses **20 USDC per 2 hours per address
  per chain** and supports Monad testnet. Neither wallet needs MON, since the facilitator pays gas.

**The implication is unwelcome but clear:** breadth across five domains is the expensive bet and
the one the judging criteria don't reward. Depth in one or two, with a real Rain policy and a real
Monad settlement, is what the evidence supports. Worth an explicit decision rather than drift.

**Still open (ours):** which domains survive, mock vs. unimplemented for the rest, and whether the
demo path touches real money at all.

---

## Provenance & staleness

Everything in the ▸ blocks comes from `~/hack/raingentic` (not a git repo; a sibling
working directory), primarily **`PLAN.md` rev 2, dated 2026-08-02**, written after five
adversarial evaluations. On-chain claims there were verified against live Monad testnet on
that date.

Two cautions:

1. **`HANDOFF.md` in that repo contains known-stale facts.** `PLAN.md` carries a corrections
   table superseding it. Where they disagree, PLAN wins. Notably: x402 v2 uses
   `PAYMENT-REQUIRED` / `PAYMENT-SIGNATURE` headers (not the v1 `X-PAYMENT` names), `@x402/*`
   packages are v2 while bare `x402-*` names are stale v1, and the repo moved to
   `github.com/x402-foundation/x402`.
2. **The verifications are six days old** and testnet details move. Re-check anything
   load-bearing before building on it.

No credentials, keys, or wallet addresses were copied from that project — its `.env` was not read.

---

## Related

- `README.md` — full project guide
- `docs/architecture.md` — layer breakdown
- `docs/api-contracts.md` — interface agreements between teams
- `~/hack/raingentic/PLAN.md` — the earlier project's plan (source for the ▸ blocks)
