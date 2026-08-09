// What a seller agent actually does when you pay it.
//
// Extracted from the HTTP route so the route and the MCP `hire_agent` tool share one
// implementation — an LLM agent and a REST client must not get different answers.
//
// The seller is deliberately naive (question 7.4): it does not really search. It
// returns one LineItem plus a quality score standing in for a real evaluation of the
// answer, which is what lets nine sellers exist without nine actual agents.

import { domainOf, type AgentType } from "../agent/agents.seed.js";
import { LineItemSchema, type LineItem } from "../domain/shared/trip.js";

// ---- how good was the answer? ----------------------------------------------
//
// Quality is DRAWN, not fixed (question 7.5). A fixed score meant an agent returned
// exactly the same number forever, which makes reputation meaningless: a rating has
// nothing to average over. A draw means a good agent usually delivers and sometimes
// disappoints, and a weak one occasionally gets lucky.

// Tiers within a category sit near 0.94 / 0.82 / 0.61, so σ = 0.08 lets the
// distributions overlap while keeping the tiers distinguishable. Wider and the rating
// is noise; narrower and it's deterministic behaviour with extra steps.
const QUALITY_SIGMA = 0.08;

// Never exactly 0 or 1 — a seller always delivers something, nothing is perfect. Also
// stops truncation from piling probability mass on the ends.
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

/** FNV-1a, to mix an agentId into a seed so each agent gets its own stream. */
function hashString(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * A seeded stream is derived from (seed, agentId) rather than one shared sequence.
 *
 * A single process-wide stream is reproducible only for the life of the process: run #2
 * consumes draws 7–12 where run #1 consumed 1–6, so a fixed seed produced a *different*
 * result every run. Keying on the agent makes a seeded run identical every time,
 * whatever the call order or process age.
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
// answer drifts upward, which is what "worse advice" means when nobody is really
// searching.
const CATALOGUE: Record<AgentType, { label: string; baseCents: number; path: string }> = {
  flight: { label: "JFK → CDG round trip, Mar 14–21", baseCents: 74_000, path: "/flights/JFK-CDG" },
  hotel: { label: "Hôtel Ibis Paris Bastille, 7 nights", baseCents: 58_000, path: "/hotels/paris" },
  car: { label: "Compact rental, 7 days, CDG pickup", baseCents: 32_000, path: "/cars/cdg" },
};

export type Answer = { quality: number; lineItem: LineItem };

export class SellerError extends Error {}

/**
 * Ask one agent for one recommendation.
 *
 * `capCents` is the budget the buyer is willing to go to. Supply it and the quote is
 * clamped to it, so an unlucky draw can never push an item past its domain cap — a
 * rejected allocation is a beat to stage deliberately, not one to leave to chance in
 * front of judges. Omit it and the raw drift shows through, which is how the rejection
 * path stays reachable.
 */
export function answerQuery(
  agent: { agentId: string; name: string; type: string; qualityPercent?: number },
  options: { capCents?: number; seed?: number } = {},
): Answer {
  const type = String(agent.type) as AgentType;
  const spec = CATALOGUE[type];
  if (!spec) throw new SellerError(`agent ${agent.agentId} has unknown type ${type}`);

  const random =
    options.seed !== undefined && Number.isFinite(options.seed)
      ? seededStream(Number(options.seed), agent.agentId)
      : HAS_ENV_SEED
        ? seededStream(ENV_SEED, agent.agentId)
        : Math.random;

  const mean = Math.max(0, Math.min(1, Number(agent.qualityPercent ?? 50) / 100));
  const quality = drawQuality(mean, random);

  const drifted = Math.round(spec.baseCents * (1 + (1 - quality) * 0.45));
  const cap = Number(options.capCents);
  const amountCents = Number.isFinite(cap) && cap > 0 ? Math.min(drifted, Math.round(cap)) : drifted;

  // The seller owns only what the seller knows. `id` and `domain` belong to the client —
  // ids must be unique across the assembled trip, and the client holds the
  // agent-type → trip-domain mapping. Filled with defensible values so the answer
  // validates standalone; the client is expected to overwrite them.
  const candidate = {
    id: `${type}-${agent.agentId}`,
    domain: domainOf(type),
    label: spec.label,
    vendor: agent.name,
    vendorUrl: `https://www.${agent.name}${spec.path}`,
    maxSpend: { amountCents, currency: "USD" },
    merchantAllowlist: [agent.name],
    payable: true,
  };

  // Validate our own output, so a broken seller fails here — named — rather than
  // surfacing later as a zod dump on the whole assembled trip.
  const parsed = LineItemSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new SellerError(
      `agent ${agent.agentId} produced an invalid LineItem: ${parsed.error.message}`,
    );
  }

  return { quality, lineItem: parsed.data };
}
