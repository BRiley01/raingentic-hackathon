// Pump the scripted run through the REAL backend: `npm run replay`.
//
// The mock in run.ts drives the canvas with no server at all. This drives the
// canvas with the whole actual transport in the loop — bus, ring buffer, SSE,
// reconnect — while still needing no chain, no facilitator and no wallets.
//
// That is the fallback the spec asks for (§2a "POST /api/events/replay"): if the
// testnet is unwell at showtime you demo `?live=1` and nothing on screen is
// pretending. It is also the only way to exercise the reconnect/replay path
// before the backend emits anything of its own.
//
//   npm run replay              full 30s run
//   npm run replay -- 4         4× speed
//   npm run replay -- 1 http://localhost:3000

import { buildRun } from "./run.js";

const speed = Number(process.argv[2] ?? 1) || 1;
const base = process.argv[3] ?? "http://localhost:3000";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const steps = buildRun();

  // Clear the ring buffer so a reconnecting browser doesn't stitch this run onto
  // the tail of the last one.
  const cleared = await fetch(`${base}/api/events/reset`, { method: "POST" }).catch(() => null);
  if (!cleared?.ok) {
    console.error(`✗ no backend at ${base} — start it with \`npm run dev\` in the repo root`);
    process.exit(1);
  }

  console.log(`replaying ${steps.length} events at ${speed}× into ${base}\n`);

  for (const step of steps) {
    await sleep(step.after / speed);
    const res = await fetch(`${base}/api/events/emit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(step.event),
    });
    if (!res.ok) {
      console.error(`✗ ${step.event.type} rejected: ${res.status}`);
      process.exit(1);
    }
    const stamped = (await res.json()) as { seq: number };
    console.log(`  ${String(stamped.seq).padStart(2)}  ${step.event.type}`);
  }

  console.log(`\n✓ run complete — open http://localhost:5173/?live=1`);
}

void main();
