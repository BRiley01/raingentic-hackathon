// The marketplace, agent-by-agent.
//
//   GET  /api/agents/:agentId          read one listing
//   POST /api/agents/:agentId/query    pay an agent and get one recommendation
//   POST /api/agents/:agentId/rating   rate it afterwards — persisted, per agent
//   POST /api/marketplace/reset        restore seeded ratings between rehearsals
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
import {
  ensureDefaultAgents,
  readAgents,
  recordAgentRatingById,
  resetAgentRatings,
} from "../../agent/file-store.js";
import { answerQuery, SellerError } from "../../marketplace/seller.js";

const router = express.Router();

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

/**
 * Rate one agent. This is the write that makes reputation mean something.
 *
 * Distinct from POST /agents/rating, which buckets by TYPE and keeps the result in
 * memory — rating one hotel agent there moved all three, and a restart erased it.
 */
router.post("/agents/:agentId/rating", async (req: any, res: any) => {
  try {
    const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
    const stars = Number(body.stars ?? body.rating ?? body.score);

    if (!Number.isFinite(stars) || stars < 1 || stars > 5) {
      return res.status(400).json({ error: "stars must be a number from 1 to 5" });
    }

    const updated = await recordAgentRatingById(String(req.params.agentId), stars);
    if (!updated) return res.status(404).json({ error: `no such agent: ${req.params.agentId}` });

    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

/**
 * Restore every rating to its seeded value. Needed the moment ratings persist:
 * otherwise each rehearsal starts wherever the last one ended.
 */
router.post("/marketplace/reset", async (_req: any, res: any) => {
  try {
    await ensureDefaultAgents();
    await resetAgentRatings();
    const agents = await readAgents();
    return res.json({ ok: true, agents: agents.map(toListing) });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

router.post("/agents/:agentId/query", async (req: any, res: any) => {
  try {
    const agent = await findAgent(req.params.agentId);
    if (!agent) return res.status(404).json({ error: `no such agent: ${req.params.agentId}` });

    // Seed precedence: per-request (tests, and a swarm wanting per-call variation), then
    // QUALITY_SEED (rehearsals), then genuinely random. `capCents` clamps the quote so an
    // unlucky draw can't fail the run.
    const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
    const seed = body.seed === undefined ? undefined : Number(body.seed);
    const capCents = Number(body.capCents);

    let answer;
    try {
      answer = answerQuery(agent, {
        seed,
        capCents: Number.isFinite(capCents) ? capCents : undefined,
      });
    } catch (err) {
      if (err instanceof SellerError) return res.status(422).json({ error: err.message });
      throw err;
    }

    return res.json({
      agentId: agent.agentId,
      name: agent.name,
      quality: answer.quality,
      lineItem: answer.lineItem,
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

export default router;
