# Agent Marketplace — agents that hire other agents

A marketplace where an agent **discovers** specialists by capability, picks who to hire on
**price versus reputation**, pays them **per call in on-chain USDC micropayments**, and
**rates** what it got — so the next buyer sees it.

None of that is domain-specific. **Planning a trip is the worked example**, chosen because it
needs several specialists at once and the answers have a second act: committing real money to
them.

Two rails, and the gap between them is the point:

| | Tier 1 — the advice | Tier 2 — the trip |
|---|---|---|
| Who pays whom | client agent → seller agent's wallet | client agent → real merchant |
| Rail | **x402** micropayments on Monad testnet | **Rain** scoped cards |
| What's bought | *information* — one answer to one question | the actual flight / hotel / car |
| Scale | fractions of a dollar | ~$1,700 |

**Sub-dollar advice moves a $1,700 trip.** That juxtaposition is the pitch, and the live
canvas renders it.

> **New here, or judging this?** Read **[OVERVIEW.md](OVERVIEW.md)** first — what's real
> (with on-chain transaction hashes you can look up), which five files to read, and the
> design decisions behind them. Three minutes.

**Live:** <https://raingentic-marketplace.fly.dev/?mode=live> — the canvas, rendering the
deployed backend's real event stream. Its MCP endpoint is `/api/mcp` on the same host, so a
client agent anywhere can shop this marketplace with nothing running locally.

---

## Run it

Three terminals. Nothing here needs a chain or an API key to *look* right — the display
ships with a scripted run.

```bash
# 1. the API (marketplace, MCP server, event stream)
npm install
npm run dev                       # :3000

# 2. the canvas
cd web && npm install && npm run dev    # :5173  → open http://127.0.0.1:5173

# 3. drive a run
npm run simulate                  # walks the REST API end to end, ~30s
npm run mcp:drive                 # walks the MCP tools instead
```

The canvas has a **SIMULATOR / LIVE** toggle. Simulator plays a scripted run with no
backend at all; live renders whatever the server is actually emitting. See
[`web/README.md`](web/README.md).

### With a real LLM driving it

The client agent is [rain-cli](https://github.com/aknlite48/rain-cli) — a terminal coding
agent that speaks MCP. It needs Bun, an Anthropic key and a real TTY.

```bash
cd clients/buyer                # its AGENTS.md makes rain-cli act as a buyer, not a coder
rain-code                       # or: bun ~/hack/rain-cli/src/index.ts
> /mcp                          # Enter on "marketplace" — connect is per-run, every launch
> I want a week in Paris for two in March. Total budget $1,800. Book it.
```

### With real money

Payments are simulated until a `.env` supplies all three of `USDC_ADDRESS`,
`X402_FACILITATOR_URL` and `BUYER_PRIVATE_KEY`. Then an unpaid request to a seller gets a
real `402`, the buyer signs EIP-3009, the facilitator settles on Monad, and the canvas
carries clickable transaction hashes. Simulated payments are always **labelled as such** on
screen — nothing ever implies a settlement that didn't happen.

Only the **buyer** needs funding. The nine seller wallets are receive-only and hold no
keys, and the facilitator pays gas, so nothing needs MON.

### Deploying it

One Fly app serves the API, the MCP endpoint and the built canvas together — the UI fetches
relative URLs, so same-origin means no CORS, and `hire_agent`'s x402 self-call stays on the
same machine as the paywall it has to satisfy.

```bash
flyctl deploy --ha=false
```

**`--ha=false` is not optional.** Fly adds a second machine on any deploy without it, and
this process holds the active run, the event replay buffer and the ratings file in memory
and on local disk — two machines means the canvas renders one reality while the client agent
drives another. See the comments in [`fly.toml`](fly.toml); secrets go in with
`flyctl secrets import < .env`, never in the image.

---

## How it fits together

```
rain-cli (LLM)  ──MCP──►  /api/mcp
                            │   tools: start_trip_run, list_agents, hire_agent,
                            │          rate_agent, settle_trip, trip_status
                            ▼
                    marketplace + sellers  ──x402──►  Monad testnet
                            │
                            ├─ emit() ──►  /api/events (SSE)  ──►  canvas
                            │
                            └─ TripRequest ──►  allocator ──► Rain scoped cards
```

**The client agent orchestrates; the server holds the artifacts.** `hire_agent`
accumulates `LineItem`s server-side and `settle_trip` takes no arguments, so the LLM never
touches a `TripRequest` — it cannot emit an invalid one, mangle a payload, or lose an item
to its context window.

**Events are emitted server-side**, so the client repo needs no knowledge of the event
contract. Nothing can drift.

### Layout

| | |
|---|---|
| `src/agent/agents.seed.ts` | the nine seller agents — the canonical marketplace |
| `src/marketplace/` | what a seller returns (`seller.ts`), and the run in flight (`run-state.ts`) |
| `src/mcp/server.ts` | the marketplace as MCP tools — how the real client agent shops |
| `src/payments/x402.ts` | real USDC settlement, both sides |
| `src/trip/service.ts` | tier‑1 → tier‑2: allocate, provision cards, settle |
| `src/events/` | the event contract (`types.ts`) and the bus (`bus.ts`) |
| `src/domain/shared/` | `trip.ts` (the handoff schema), `allocator.ts`, `scope-cards.ts` |
| `src/dev/` | `simulate-run.ts` and `mcp-drive.ts` — harnesses, not product |
| `web/` | the canvas (its own `package.json`) |

---

## Checks

```bash
npm test              # 45 tests
npm run typecheck
cd web && npm run typecheck && npm run verify:mock && npm run shoot
```

`verify:mock` asserts the scripted run's event order *and* that the `TripRequest` it hands
tier 2 passes tier 2's own zod schema. `shoot` screenshots the canvas and fails on clipped
nodes, overlapping nodes, or console errors.

---

## Docs

| | |
|---|---|
| [`docs/api-contracts.md`](docs/api-contracts.md) | every endpoint + the MCP tools. **Start here.** |
| [`docs/tier1-events.md`](docs/tier1-events.md) | the event contract the canvas consumes |
| [`docs/tier1-display-spec.md`](docs/tier1-display-spec.md) | why the canvas looks the way it does |
| [`docs/marketplace-questions.md`](docs/marketplace-questions.md) | every decision, and why |
| [`docs/open-questions.md`](docs/open-questions.md) | Monad/Rain notes and the x402 v1/v2 trap |

---

## Two things that will trip you up

**`npm install` has to run inside `web/` as well** — it has its own `package.json`, and a
root install leaves the canvas broken with a confusing error. Needs Node 20.19+/22.12+.

**`data/` is runtime state, not source.** Ratings persist there and it's gitignored;
`agents.json` is regenerated from `agents.seed.ts` whenever `SEED_VERSION` changes. To
reset a rehearsal: `curl -X POST localhost:3000/api/marketplace/reset`.

## Dead — do not build against it

`search → hold → confirm → cancel` is gone: deleted, not deferred (question 4.1).
`search()` is the only provider operation. Money moves on the two rails instead.
