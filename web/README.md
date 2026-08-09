# The live display

The god-view canvas: 9 seller agents, the client agent shopping them, and the Rain
scoped cards spending the result.

## Run it

**No backend, no wallets, no testnet required.** It plays a scripted run on load.

```bash
git pull
cd web
npm install      # web/ has its OWN package.json — a root npm install does not cover it
npm run dev
```

Then open **http://127.0.0.1:5173**

Needs Node 20.19+ (or 22.12+) — Vite 8 refuses older. `node -v` to check.

## What you should see

A dark canvas, three columns of agent cards (Flights / Hotels / Car), and a ~30s
run: the client queries a category, three cards light up, it explains out loud
which one it's hiring and why, pays over x402, gets an answer, rates it — then the
trip hands off to Rain and three cards charge the real merchants.

Header shows the whole point side by side: **sub-dollar advice moved $1,714.**

Click any agent card to open its wallet on the Monad explorer. (In the scripted
run the wallets are fabricated, so that page will be empty.)

## URL switches

| URL | |
|---|---|
| `/` | scripted run, plays on load |
| `/?speed=4` | 4× speed — for rehearsing one beat repeatedly |
| `/?frame=10` | freeze at beat 10 of 37, no timers. Reproducible; good for screenshots |
| `/?live=1` | read the real backend's SSE stream instead of the script |

There's a **hide log** button bottom-right if the event log is in your way, and
fit/zoom controls bottom-left for whatever projector we end up on.

## Running against the real backend

Two terminals:

```bash
# terminal 1 — repo root: the API + SSE stream on :3000
npm run dev

# terminal 2 — web/: the canvas on :5173, proxying /api to :3000
npm run dev
```

Open **http://127.0.0.1:5173/?live=1**. It will sit empty until something emits —
the backend has to call `emit(...)` (see `docs/tier1-events.md`). To drive it
without a chain:

```bash
cd web && npm run replay        # pumps the scripted run through the real bus + SSE
```

## Checks

```bash
npm run typecheck
npm run verify:mock    # asserts the run's event order + that the TripRequest
                       # it hands tier 2 passes tier 2's own zod schema
```

`npm run shoot` screenshots the canvas and asserts no clipped nodes, no
overlapping nodes and no console errors — it needs Chromium, so first time:
`npx playwright install chromium` (plus `sudo npx playwright install-deps
chromium` on Linux/WSL).

## Related

- `docs/tier1-events.md` — the event contract, if you're emitting
- `docs/tier1-display-spec.md` — why the canvas looks the way it does
