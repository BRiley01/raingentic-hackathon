// Smoke test for the mock run: `npm run verify:mock`.
//
// The point is the last assertion — the TripRequest the mock hands tier 2 is
// validated with tier 2's OWN zod schema. If the mock passes, the real client
// agent emitting the same shape will too, and the tier-1 → tier-2 seam is proven
// before either side is built.

import { parseTripRequest } from "@shared/domain/shared/trip.js";
import type { DemoEvent } from "@shared/events/types.js";
import { buildGraph, type AgentVisual } from "../state/graph.js";
import { buildRun } from "./run.js";

const steps = buildRun();
const events = steps.map((s) => s.event as Record<string, unknown>);
const totalMs = steps.reduce((sum, s) => sum + s.after, 0);

const counts = new Map<string, number>();
for (const e of events) counts.set(e.type as string, (counts.get(e.type as string) ?? 0) + 1);

console.log(`${events.length} events over ${(totalMs / 1000).toFixed(1)}s\n`);
for (const [type, n] of counts) console.log(`  ${n}×  ${type}`);

const fail = (msg: string) => {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
};

// The 402 must be visible: challenge strictly before signed, for every payment.
for (const id of ["pay_flights", "pay_hotels", "pay_transport"]) {
  const at = (type: string) => events.findIndex((e) => e.type === type && e.paymentId === id);
  const [challenge, signed, settled] = [
    at("payment.challenge"),
    at("payment.signed"),
    at("payment.settled"),
  ];
  if (challenge < 0 || signed < 0 || settled < 0) fail(`${id}: missing a payment beat`);
  if (!(challenge < signed && signed < settled)) fail(`${id}: payment beats out of order`);
}

// Every settlement carries on-chain proof — the one non-negotiable in the contract.
for (const e of events.filter((e) => e.type === "payment.settled")) {
  const tx = String(e.txHash ?? "");
  if (!/^0x[0-9a-f]{64}$/.test(tx)) fail(`${e.agentId}: txHash is not a 32-byte hex hash (${tx})`);
}

// The headline numbers must agree with the beats that produced them.
const complete = events.find((e) => e.type === "run.complete")!;
const charged = events
  .filter((e) => e.type === "tier2.charge")
  .reduce((sum, e) => sum + Number(e.amountCents), 0);
if (complete.tier2SettledCents !== charged) {
  fail(`run.complete says ${complete.tier2SettledCents}¢ settled but charges sum to ${charged}¢`);
}

// The seam: tier 1's output through tier 2's validator.
const assembled = events.find((e) => e.type === "trip.assembled")!;
const trip = parseTripRequest(assembled.trip);

const capped = trip.items.reduce((sum, i) => sum + i.maxSpend.amountCents, 0);
if (capped > trip.budget.amountCents) {
  fail(`item caps (${capped}¢) exceed budget (${trip.budget.amountCents}¢) — allocator would reject`);
}

// ---- the fold -------------------------------------------------------------
// Replay the log prefix by prefix. Every intermediate frame must be coherent, not
// just the last one — the graph is rebuilt from scratch on every event, so a bad
// prefix is a bug a viewer would actually see.
const stamped = events.map((e, i) => ({ seq: i + 1, ts: 0, ...e })) as DemoEvent[];

for (let n = 1; n <= stamped.length; n++) {
  const g = buildGraph(stamped.slice(0, n));
  const ids = new Set(g.nodes.map((node) => node.id));
  for (const edge of g.edges) {
    // A source/target that names a node which isn't on the canvas doesn't error —
    // React Flow just silently drops the edge. Catch it here instead of squinting
    // at the screen wondering where the payment line went.
    if (!ids.has(edge.source)) fail(`after ${n} events: edge ${edge.id} → missing source ${edge.source}`);
    if (!ids.has(edge.target)) fail(`after ${n} events: edge ${edge.id} → missing target ${edge.target}`);
  }
  if (new Set(g.nodes.map((node) => node.id)).size !== g.nodes.length) {
    fail(`after ${n} events: duplicate node ids`);
  }
  if (new Set(g.edges.map((e) => e.id)).size !== g.edges.length) {
    fail(`after ${n} events: duplicate edge ids`);
  }
}

const final = buildGraph(stamped);
const agents = final.nodes.filter((n) => n.type === "agent");
const states = new Map<string, number>();
for (const node of agents) {
  const { agent } = node.data as unknown as { agent: AgentVisual };
  states.set(agent.state, (states.get(agent.state) ?? 0) + 1);
}

if (agents.length !== 9) fail(`expected 9 agent nodes, got ${agents.length}`);
if (states.get("responded") !== 3) fail(`expected 3 agents answered, got ${states.get("responded")}`);
if (final.spentUsdc !== complete.tier1SpentUsdc) {
  fail(`fold spent $${final.spentUsdc} but run.complete says $${complete.tier1SpentUsdc}`);
}

console.log(`\n✓ payment beats ordered, every settle has a txHash`);
console.log(
  `✓ fold coherent at all ${stamped.length} prefixes — no dangling edges, no duplicate ids`,
);
console.log(
  `✓ final graph: ${final.nodes.length} nodes, ${final.edges.length} edges, ` +
    `agents ${[...states].map(([s, n]) => `${n} ${s}`).join(", ")}`,
);
console.log(`✓ TripRequest passes tier 2's zod schema (${trip.items.length} items)`);
console.log(`✓ caps $${(capped / 100).toFixed(2)} within budget $${(trip.budget.amountCents / 100).toFixed(2)}`);
console.log(`✓ tier 1 spent $${complete.tier1SpentUsdc} USDC → tier 2 settled $${(charged / 100).toFixed(2)}`);
