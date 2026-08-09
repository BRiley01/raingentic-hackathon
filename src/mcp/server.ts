// The marketplace as an MCP server.
//
// This is how the real client agent (rain-cli) shops: it connects to /mcp, merges these
// tools into its toolset, and an LLM does the deliberating. Two things follow, and both
// are why this is a better integration than a bespoke HTTP client:
//
//  1. THE REASONING IS REAL. `hire_agent` requires a `reasoning` argument — an agent
//     cannot spend money without saying why — so the words on the canvas are the
//     model's own, not a template.
//  2. THE EVENTS ARE OURS. These handlers run in our process, so we emit every event
//     ourselves. The client repo needs no knowledge of the event contract, no shared
//     types, and no /api/events/emit call. Nothing can drift.
//
// The agent orchestrates; the SERVER holds the artifacts (see run-state.ts). The LLM
// never touches a TripRequest, so it cannot produce an invalid one.

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { emit } from "../events/bus.js";
import { ensureDefaultAgents, readAgents, recordAgentRatingById } from "../agent/file-store.js";
import { AGENT_TYPES, domainOf, parseAgentType, type AgentType } from "../agent/agents.seed.js";
import { answerQuery } from "../marketplace/seller.js";
import {
  activeRun,
  assembleTrip,
  capFor,
  missingDomains,
  recordHire,
  recordListing,
  requireRun,
  startRun,
  type Listing,
} from "../marketplace/run-state.js";
import { settleTrip } from "../trip/service.js";
import { explorerTxUrl, payAndQuery, x402Enabled } from "../payments/x402.js";

const NETWORK = "eip155:10143"; // Monad testnet
const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** MCP tools return text. Keep it compact — this lands in the model's context. */
const text = (body: string) => ({ content: [{ type: "text" as const, text: body }] });
const failure = (body: string) => ({ content: [{ type: "text" as const, text: body }], isError: true });

async function listingsOfType(type: AgentType): Promise<Listing[]> {
  await ensureDefaultAgents();
  const agents = await readAgents();
  return agents
    .filter((a: any) => String(a.type).toLowerCase() === type)
    .map((a: any) => ({
      agentId: a.agentId,
      name: a.name,
      type,
      rating: a.rating,
      ratingCount: a.ratingCount,
      priceUsdc: a.priceUsdc,
      wallet: a.wallet,
      // qualityPercent deliberately NOT surfaced: an agent publishing its own quality
      // would remove the reason to pay to find out.
      qualityPercent: a.qualityPercent,
    }));
}

export function createMarketplaceMcpServer(): McpServer {
  const server = new McpServer({ name: "raingentic-marketplace", version: "1.0.0" });

  // ---- 1. start ------------------------------------------------------------
  server.registerTool(
    "start_trip_run",
    {
      title: "Start a trip run",
      description:
        "Begin shopping for a trip. Call this FIRST. Sets the budget and the per-category " +
        "spending caps, and resets the live display. Returns the caps you must shop " +
        "within. Note there are two separate pots: the trip budget, and the much smaller " +
        "amount you spend hiring advisors — spend the second one sparingly, since every " +
        "cent of it is a cent not spent on the trip.",
      inputSchema: {
        goal: z.string().describe("What the traveller wants, in their words"),
        budgetUsd: z.number().positive().describe("Total budget for the whole trip, in dollars"),
        categories: z
          .array(z.enum(["flight", "hotel", "car"]))
          .optional()
          .describe("Which categories to shop. Defaults to all three."),
      },
    },
    async ({ goal, budgetUsd, categories }) => {
      const budgetCents = Math.round(budgetUsd * 100);
      const types = (categories?.length ? categories : AGENT_TYPES) as AgentType[];
      const run = startRun(goal, budgetCents, types);

      emit("run.started", { runId: run.runId, goal, budgetCents });

      const caps = types
        .map((t) => `  ${t.padEnd(7)} cap ${usd(capFor(run, t))}`)
        .join("\n");
      return text(
        `Run ${run.runId} started. Budget ${usd(budgetCents)}.\n\n` +
          `Per-category caps (an agent's recommendation must fit inside its cap):\n${caps}\n\n` +
          `Next: call list_agents for each category, then hire_agent for the one you choose.`,
      );
    },
  );

  // ---- 2. discover ---------------------------------------------------------
  server.registerTool(
    "list_agents",
    {
      title: "List marketplace agents",
      description:
        "Show the agents selling advice in one category. Each has a rating (from past " +
        "buyers) and a price per question — these are the ONLY signals available before " +
        "you pay, and they PULL AGAINST EACH OTHER. The best-rated agent is usually the " +
        "most expensive, and the advice budget is finite, so buying the top of every " +
        "category is a choice with a cost, not the safe default.",
      inputSchema: {
        category: z.enum(["flight", "hotel", "car"]).describe("Which kind of agent"),
      },
    },
    async ({ category }) => {
      const run = requireRun();
      const type = parseAgentType(category) as AgentType;
      const listings = await listingsOfType(type);
      if (!listings.length) return failure(`No agents of type ${category} in the marketplace.`);

      recordListing(type, listings);
      const domain = domainOf(type);
      const queryId = `q_${domain}`;

      emit("marketplace.query", { queryId, category: domain });
      emit("marketplace.results", {
        queryId,
        category: domain,
        agents: listings.map((l) => ({ ...l, category: domain })),
      });

      const rows = listings
        .map(
          (l) =>
            `  ${l.name.padEnd(16)} ${l.rating.toFixed(1)}★ (${l.ratingCount} ratings)   ` +
            `$${l.priceUsdc.toFixed(2)} per question   id=${l.agentId}`,
        )
        .join("\n");

      return text(
        `${listings.length} agents selling ${category} advice ` +
          `(this line item's cap is ${usd(capFor(run, type))}):\n\n${rows}\n\n` +
          `Hire one with hire_agent, and say why you picked it.`,
      );
    },
  );

  // ---- 3. pay and ask ------------------------------------------------------
  server.registerTool(
    "hire_agent",
    {
      title: "Pay an agent for a recommendation",
      description:
        "Pay one agent and get its recommendation. This spends real money — an on-chain " +
        "USDC micropayment to that agent's wallet — so choose on VALUE, not on rating " +
        "alone: a 0.5★ edge is rarely worth paying double for, and a cheaper agent whose " +
        "rating clears your bar leaves budget for the trip itself. Reserve the premium " +
        "agent for the line item where being wrong costs the most. You must justify the " +
        "choice: `reasoning` is shown to the user verbatim.",
      inputSchema: {
        agentId: z.string().describe("The agent's id, from list_agents"),
        reasoning: z
          .string()
          .min(10)
          .describe(
            "Why this one and not the others — name the agent you passed over and say what " +
              "its extra rating would have cost. Shown to the user as your own words.",
          ),
      },
    },
    async ({ agentId, reasoning }) => {
      const run = requireRun();
      await ensureDefaultAgents();
      const agents = await readAgents();
      const wanted = String(agentId).toLowerCase();
      const agent = agents.find(
        (a: any) =>
          String(a.agentId ?? "").toLowerCase() === wanted ||
          String(a.name ?? "").toLowerCase() === wanted,
      );
      if (!agent) return failure(`No such agent: ${agentId}. Call list_agents to see the ids.`);

      const type = String(agent.type) as AgentType;
      const domain = domainOf(type);
      const queryId = `q_${domain}`;
      const shortlist = run.listed.get(type) ?? [];
      const capCents = capFor(run, type);

      // The deliberation beat: the shortlist it chose from, and the model's own words.
      emit("client.deliberate", {
        queryId,
        considering: shortlist.length ? shortlist.map((l) => l.agentId) : [agent.agentId],
        reasoning,
      });
      emit("client.select", { queryId, agentId: agent.agentId, reason: reasoning.slice(0, 120) });

      const paymentId = `pay_${domain}`;
      let answer: { quality: number; lineItem: any };
      let settlement = "";

      if (x402Enabled()) {
        // REAL x402 on Monad. The seller route is paywalled, so this actually signs
        // EIP-3009 and the facilitator settles on-chain before the answer comes back —
        // the agent cannot be tricked into answering unpaid.
        const port = process.env.PORT ?? 3000;
        const url = `http://127.0.0.1:${port}/api/agents/${encodeURIComponent(agent.agentId)}/query`;
        let paid;
        try {
          paid = await payAndQuery(url, { capCents }, agent.priceUsdc);
        } catch (err) {
          emit("payment.failed", {
            paymentId,
            agentId: agent.agentId,
            reason: err instanceof Error ? err.message.slice(0, 200) : String(err),
          });
          return failure(
            `Payment to ${agent.name} failed, so no advice was received: ` +
              `${err instanceof Error ? err.message : String(err)}`,
          );
        }

        // The challenge comes from the seller's actual 402, not from the listing.
        emit("payment.challenge", {
          paymentId,
          agentId: agent.agentId,
          amountUsdc: paid.challenge.amountUsdc,
          payTo: paid.challenge.payTo || agent.wallet,
          network: paid.challenge.network,
        });
        emit("payment.signed", { paymentId, agentId: agent.agentId });
        emit("payment.settled", {
          paymentId,
          agentId: agent.agentId,
          txHash: paid.txHash,
          durationMs: paid.durationMs,
          explorerUrl: paid.txHash ? explorerTxUrl(paid.txHash) : undefined,
        });

        answer = { quality: paid.body.quality, lineItem: paid.body.lineItem };
        settlement = paid.txHash
          ? `Settled on Monad in ${paid.durationMs}ms — tx ${paid.txHash}\n`
          : `Settled in ${paid.durationMs}ms.\n`;
      } else {
        // Simulated: `simulated: true` and NO txHash, because there is no transaction and
        // inventing one would be the most dishonest thing this file could do.
        emit("payment.challenge", {
          paymentId,
          agentId: agent.agentId,
          amountUsdc: agent.priceUsdc,
          payTo: agent.wallet,
          network: NETWORK,
          simulated: true,
        });
        emit("payment.signed", { paymentId, agentId: agent.agentId, simulated: true });
        emit("payment.settled", { paymentId, agentId: agent.agentId, durationMs: 0, simulated: true });
        answer = answerQuery(agent, { capCents });
      }
      const lineItem = { ...answer.lineItem, id: `${domain}-1`, domain };

      recordHire(
        {
          agentId: agent.agentId,
          name: agent.name,
          type,
          rating: agent.rating,
          ratingCount: agent.ratingCount,
          priceUsdc: agent.priceUsdc,
          wallet: agent.wallet,
        },
        lineItem,
        answer.quality,
      );

      emit("agent.response", {
        queryId,
        agentId: agent.agentId,
        quality: answer.quality,
        lineItem,
      });

      return text(
        `Paid ${agent.name} $${agent.priceUsdc.toFixed(2)} USDC. Advice spend so far: ` +
          `$${run.spentUsdc.toFixed(2)}.\n${settlement}\n` +
          `Its recommendation: ${lineItem.label}\n` +
          `  vendor    ${lineItem.vendor}\n` +
          `  cost      ${usd(lineItem.maxSpend.amountCents)} of a ${usd(capCents)} cap\n` +
          `  quality   ${answer.quality.toFixed(2)} of 1.00 — how good this answer turned out to be\n\n` +
          `Now rate it with rate_agent so the marketplace learns. A quality of ` +
          `${answer.quality.toFixed(2)} is worth roughly ${Math.max(1, Math.min(5, Math.round(1 + answer.quality * 4)))} stars.`,
      );
    },
  );

  // ---- 4. rate -------------------------------------------------------------
  server.registerTool(
    "rate_agent",
    {
      title: "Rate an agent you paid",
      description:
        "Rate the answer you received, 1–5 stars. This is persisted and changes the agent's " +
        "public rating for everyone afterwards, so rate honestly against the quality you saw.",
      inputSchema: {
        agentId: z.string().describe("The agent you paid"),
        stars: z.number().int().min(1).max(5).describe("1 = useless, 5 = excellent"),
      },
    },
    async ({ agentId, stars }) => {
      const run = requireRun();
      if (!run.paidAgentIds.has(agentId)) {
        // Not enforced by the protocol (6.3: anyone can rate) but worth telling the model.
        return failure(`You haven't paid ${agentId} in this run. Hire it before rating it.`);
      }

      const updated = await recordAgentRatingById(agentId, stars);
      if (!updated) return failure(`No such agent: ${agentId}`);

      emit("client.rating", {
        agentId: updated.agentId,
        stars,
        newRating: updated.rating,
        newRatingCount: updated.ratingCount,
      });

      const outstanding = missingDomains(run);
      const next = outstanding.length
        ? `Still to shop: ${outstanding.join(", ")}.`
        : `Every category is covered — call settle_trip to book it.`;
      return text(
        `Rated ${updated.name} ${stars}★. Its rating is now ${updated.rating} ` +
          `across ${updated.ratingCount} ratings. ${next}`,
      );
    },
  );

  // ---- 5. hand off to tier 2 ----------------------------------------------
  server.registerTool(
    "settle_trip",
    {
      title: "Book the trip",
      description:
        "Hand the collected recommendations to the booking system, which checks them against " +
        "the budget and then issues one spend-limited card per category to pay the real " +
        "merchants. Takes no arguments — the recommendations you bought are already held for " +
        "you. Rejected if the plan breaks the budget.",
      inputSchema: {},
    },
    async () => {
      const run = requireRun();
      if (run.settled) return failure(`Run ${run.runId} has already been settled.`);

      let trip;
      try {
        trip = assembleTrip(run);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }

      const outcome = await settleTrip(trip);

      if (!outcome.ok) {
        emit("run.complete", {
          runId: run.runId,
          ok: false,
          tier1SpentUsdc: run.spentUsdc,
          tier2SettledCents: 0,
        });
        run.settled = true;
        return failure(
          `The booking system REFUSED this plan — nothing was charged:\n` +
            outcome.reasons.map((r) => `  • ${r}`).join("\n") +
            `\n\nA recommendation exceeded what the budget allows.`,
        );
      }

      run.settled = true;
      const { report } = outcome;
      emit("run.complete", {
        runId: run.runId,
        ok: report.ok,
        tier1SpentUsdc: run.spentUsdc,
        tier2SettledCents: report.totalSettledCents,
      });

      const lines = report.charges
        .map((c) => `  ${c.status.padEnd(9)} ${usd(c.amountCents).padStart(10)}  ${c.vendor}`)
        .join("\n");
      return text(
        `Booked. ${report.cards.length} spend-limited cards issued, each locked to one ` +
          `merchant.\n\n${lines}\n\n` +
          `Advice cost $${run.spentUsdc.toFixed(2)} USDC and moved ` +
          `${usd(report.totalSettledCents)} of real spending.`,
      );
    },
  );

  // ---- status --------------------------------------------------------------
  server.registerTool(
    "trip_status",
    {
      title: "Check the run",
      description: "What has been hired so far, what it cost, and what is still missing.",
      inputSchema: {},
    },
    async () => {
      const run = activeRun();
      if (!run) return text("No trip run in progress. Call start_trip_run to begin.");

      const hired = [...run.items.entries()]
        .map(([domain, item]) => `  ${domain.padEnd(10)} ${item.vendor.padEnd(16)} ${usd(item.maxSpend.amountCents)}`)
        .join("\n");
      const outstanding = missingDomains(run);

      return text(
        `Run ${run.runId} — budget ${usd(run.budgetCents)}, advice spend ` +
          `$${run.spentUsdc.toFixed(2)}.\n\n` +
          (hired ? `Hired:\n${hired}\n\n` : "Nothing hired yet.\n\n") +
          (outstanding.length ? `Still to shop: ${outstanding.join(", ")}` : "All categories covered.") +
          (run.settled ? "\nAlready settled." : ""),
      );
    },
  );

  return server;
}
