// The seller side of the marketplace.
//
//   POST /api/agents/:agentId/query   ask one agent for one recommendation
//
// This is the endpoint the client agent pays for, and the one x402 middleware will
// eventually wrap: when that lands, the first call returns 402 with a challenge and
// the retry carries PAYMENT-SIGNATURE. Nothing else about the shape changes, which
// is why it's a real HTTP route now rather than an in-process call.
//
// The seller is deliberately naive (question 7.4): it does not really search. It
// returns one LineItem plus a self-declared quality score, and the client's job is
// to decide whether that was worth paying for.

import express from "express";
import { ensureDefaultAgents, readAgents } from "../../agent/file-store.js";
import { domainOf, type AgentType } from "../../agent/agents.seed.js";
import { LineItemSchema } from "../../domain/shared/trip.js";

const router = express.Router();

// What each kind of agent sells, and roughly what it costs. `baseCents` is what a
// good agent recommends; worse agents drift upward from it (see below).
const CATALOGUE: Record<AgentType, { label: string; baseCents: number; path: string }> = {
  flight: {
    label: "JFK → CDG round trip, Mar 14–21",
    baseCents: 74_000,
    path: "/flights/JFK-CDG",
  },
  hotel: {
    label: "Hôtel Ibis Paris Bastille, 7 nights",
    baseCents: 58_000,
    path: "/hotels/paris",
  },
  car: {
    label: "Compact rental, 7 days, CDG pickup",
    baseCents: 32_000,
    path: "/cars/cdg",
  },
};

router.post("/agents/:agentId/query", async (req: any, res: any) => {
  try {
    await ensureDefaultAgents();
    const agents = await readAgents();

    const wanted = String(req.params.agentId).toLowerCase();
    const agent = agents.find(
      (a: any) =>
        String(a.agentId ?? "").toLowerCase() === wanted ||
        String(a.name ?? "").toLowerCase() === wanted,
    );

    if (!agent) return res.status(404).json({ error: `no such agent: ${req.params.agentId}` });

    const type = String(agent.type) as AgentType;
    const spec = CATALOGUE[type];
    if (!spec) return res.status(422).json({ error: `agent ${agent.agentId} has unknown type ${type}` });

    const quality = Math.max(0, Math.min(1, Number(agent.qualityPercent ?? 50) / 100));

    // A worse agent recommends a more expensive option — that is what "worse
    // advice" means when the seller isn't really searching. It is also what makes
    // the allocator's rejection reachable: a low-quality agent can drift past its
    // domain cap and get the whole trip refused on screen, which is a real
    // guardrail firing rather than a staged error.
    const amountCents = Math.round(spec.baseCents * (1 + (1 - quality) * 0.45));

    // The seller owns only what the seller knows. `id` and `domain` are the
    // client's to assign: ids must be unique across the assembled trip, and the
    // client is what holds the agent-type → trip-domain mapping. We fill both with
    // defensible values so the response validates standalone, and expect the
    // client to overwrite them.
    const lineItem = {
      id: `${type}-${agent.agentId}`,
      domain: domainOf(type),
      label: spec.label,
      vendor: agent.agentId,
      vendorUrl: `https://www.${agent.agentId}${spec.path}`,
      maxSpend: { amountCents, currency: "USD" },
      merchantAllowlist: [agent.agentId],
      payable: true,
    };

    // Validate our own output. A seller that emits an invalid LineItem should fail
    // here, named, rather than surfacing later as a zod dump on the whole trip.
    const parsed = LineItemSchema.safeParse(lineItem);
    if (!parsed.success) {
      return res.status(500).json({
        error: `agent ${agent.agentId} produced an invalid LineItem`,
        issues: parsed.error.issues,
      });
    }

    return res.json({
      agentId: agent.agentId,
      // 0–1, self-declared, per question 7.5. Deliberately the agent's own claim
      // about its answer — the client rates it, nobody audits it.
      quality,
      lineItem: parsed.data,
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

export default router;
