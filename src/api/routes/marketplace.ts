// The marketplace, agent-by-agent.
//
//   GET  /api/agents/:agentId         read one listing
//   POST /api/agents/:agentId/query   pay an agent and get one recommendation
//
// The query route is the one x402 middleware will wrap: when that lands, the first
// call returns 402 with a challenge and the retry carries PAYMENT-SIGNATURE. Nothing
// about the request or response shape changes, which is why it is a real HTTP route
// now rather than an in-process call.
//
// The seller is deliberately naive (question 7.4): it does not really search. It
// returns one LineItem plus a quality score standing in for a real evaluation of the
// answer, and the client decides whether that was worth paying for.

import express from "express";
import { ensureDefaultAgents, readAgents } from "../../agent/file-store.js";
import { domainOf, type AgentType } from "../../agent/agents.seed.js";
import { LineItemSchema } from "../../domain/shared/trip.js";

const router = express.Router();

// ---- how good was the answer? ----------------------------------------------
//
// Quality is DRAWN, not fixed (question 7.5). A fixed score meant `booking.com`
// returned exactly 0.91 forever, which makes reputation meaningless: ratings can
// never move because there is nothing to average over. A draw means a good agent
// usually delivers and sometimes disappoints, and a weak one occasionally gets
// lucky — which is what makes a rating something an agent earns.

// Tiers within a category sit near 0.94 / 0.82 / 0.61, so σ = 0.08 lets the
// distributions overlap while keeping the tiers distinguishable. Wider and the
// rating is noise; narrower and it's the old deterministic behaviour with extra
// steps.
const QUALITY_SIGMA = 0.08;

// Never exactly 0 or 1 — a seller always delivers something and nothing is perfect.
// Also stops truncation from piling probability mass on the ends.
const QUALITY_MIN = 0.05;
const QUALITY_MAX = 0.99;

/** mulberry32 — small, fast, good enough to make a rehearsal reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a. Mixes an agentId into a seed so each agent gets its own stream. */
function hashString(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * A seeded stream is derived from (seed, agentId) rather than being one shared
 * sequence.
 *
 * A single process-wide stream is reproducible only for the lifetime of the process:
 * run #2 consumes draws 7–12 where run #1 consumed 1–6, so `QUALITY_SEED=42` gave a
 * *different* result on every run — reproducible per process, which is not the
 * property anyone wants. Keying on the agent makes a seeded run identical every
 * time, independent of call order, process age, or how many other agents were asked.
 */
function seededStream(seed: number, agentId: string): () => number {
  return mulberry32((seed ^ hashString(agentId)) >>> 0);
}

const ENV_SEED = Number(process.env.QUALITY_SEED);
const HAS_ENV_SEED = Boolean(process.env.QUALITY_SEED) && Number.isFinite(ENV_SEED);

/** Box–Muller, truncated, centred on the agent's advertised quality. */
function drawQuality(mean: number, random: () => number): number {
  const u1 = Math.max(random(), 1e-9);
  const u2 = random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.min(QUALITY_MAX, Math.max(QUALITY_MIN, mean + QUALITY_SIGMA * z));
}

// What each kind of agent sells. `baseCents` is what a good answer costs; a worse
// answer drifts upward from it, which is what "worse advice" means when the seller
// isn't really searching.
const CATALOGUE: Record<AgentType, { label: string; baseCents: number; path: string }> = {
  flight: { label: "JFK → CDG round trip, Mar 14–21", baseCents: 74_000, path: "/flights/JFK-CDG" },
  hotel: { label: "Hôtel Ibis Paris Bastille, 7 nights", baseCents: 58_000, path: "/hotels/paris" },
  car: { label: "Compact rental, 7 days, CDG pickup", baseCents: 32_000, path: "/cars/cdg" },
};

/** Resolve by UUID. Name is also accepted — a convenience for hand-testing. */
async function findAgent(idOrName: string) {
  await ensureDefaultAgents();
  const agents = await readAgents();
  const wanted = String(idOrName).toLowerCase();
  return agents.find(
    (a: any) =>
      String(a.agentId ?? "").toLowerCase() === wanted ||
      String(a.name ?? "").toLowerCase() === wanted,
  );
}

/** The listing as a buyer sees it. Never exposes qualityPercent. */
function toListing(agent: any) {
  return {
    agentId: agent.agentId,
    name: agent.name,
    type: agent.type,
    rating: agent.rating,
    ratingCount: agent.ratingCount,
    priceUsdc: agent.priceUsdc,
    wallet: agent.wallet,
  };
}

router.get("/agents/:agentId", async (req: any, res: any) => {
  try {
    const agent = await findAgent(req.params.agentId);
    if (!agent) return res.status(404).json({ error: `no such agent: ${req.params.agentId}` });
    return res.json(toListing(agent));
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

router.post("/agents/:agentId/query", async (req: any, res: any) => {
  try {
    const agent = await findAgent(req.params.agentId);
    if (!agent) return res.status(404).json({ error: `no such agent: ${req.params.agentId}` });

    const type = String(agent.type) as AgentType;
    const spec = CATALOGUE[type];
    if (!spec) {
      return res.status(422).json({ error: `agent ${agent.agentId} has unknown type ${type}` });
    }

    // Seed precedence: per-request (tests, and a swarm wanting per-call variation),
    // then QUALITY_SEED (rehearsals), then genuinely random.
    const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
    const requestSeed = Number(body.seed);
    const hasRequestSeed = body.seed !== undefined && Number.isFinite(requestSeed);

    const random = hasRequestSeed
      ? seededStream(requestSeed, String(agent.agentId))
      : HAS_ENV_SEED
        ? seededStream(ENV_SEED, String(agent.agentId))
        : Math.random;

    const mean = Math.max(0, Math.min(1, Number(agent.qualityPercent ?? 50) / 100));
    const quality = drawQuality(mean, random);

    // A worse answer costs more. BUT it is clamped to the cap the client supplied:
    // the run must never fail because of an unlucky roll. A greedy recommendation
    // blowing a domain cap is a beat worth staging deliberately, not one to leave to
    // chance in front of judges — so a good-faith seller told the budget quotes
    // inside it, and a rejection is only reachable by NOT telling it the cap.
    const capCents = Number(body.capCents);
    const drifted = Math.round(spec.baseCents * (1 + (1 - quality) * 0.45));
    const amountCents =
      Number.isFinite(capCents) && capCents > 0 ? Math.min(drifted, Math.round(capCents)) : drifted;

    // The seller owns only what the seller knows. `id` and `domain` belong to the
    // client — ids must be unique across the assembled trip, and the client holds the
    // agent-type → trip-domain mapping. Filled with defensible values so the response
    // validates standalone; the client is expected to overwrite them.
    const lineItem = {
      id: `${type}-${agent.agentId}`,
      domain: domainOf(type),
      label: spec.label,
      vendor: agent.name,
      vendorUrl: `https://www.${agent.name}${spec.path}`,
      maxSpend: { amountCents, currency: "USD" },
      merchantAllowlist: [agent.name],
      payable: true,
    };

    // Validate our own output, so a broken seller fails here — named — instead of
    // surfacing later as a zod dump on the whole assembled trip.
    const parsed = LineItemSchema.safeParse(lineItem);
    if (!parsed.success) {
      return res.status(500).json({
        error: `agent ${agent.agentId} produced an invalid LineItem`,
        issues: parsed.error.issues,
      });
    }

    return res.json({
      agentId: agent.agentId,
      name: agent.name,
      // 0–1 — how good this answer turned out to be. Stands in for evaluating the
      // answer for real (7.4/7.5), which is what lets nine sellers exist without
      // nine actual agents.
      quality,
      lineItem: parsed.data,
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

export default router;
