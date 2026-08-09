// events[] → { nodes, edges }.  The whole UI, in one fold.
//
// Node state is NEVER mutated in place (spec §5): every frame is derived from the
// event log start to finish. That is what buys us the demo insurance — replaying
// `?since=0` after a mid-demo browser refresh rebuilds the graph exactly, and
// time-travel scrubbing is nearly free if we ever want it.
//
// Layout is fixed, not a force sim. Nine agents in three tidy columns beats a
// physics graph that jiggles while a judge is watching.

import { MarkerType, type Edge, type Node } from "@xyflow/react";
import type { AgentListing, DemoEvent } from "@shared/events/types.js";
import type { LineItem } from "@shared/domain/shared/trip.js";

export type AppNode = Node<Record<string, unknown>>;

/** Per the states→colour table in spec §3. Order matters: later = further along. */
export type AgentState =
  | "idle"
  | "listed"
  | "considered"
  | "quoted"
  | "paying"
  | "paid"
  | "responded"
  | "failed";

export type AgentVisual = {
  listing: AgentListing;
  state: AgentState;
  rating: number;
  ratingCount: number;
  quality?: number; // 0–1, from agent.response
  txHash?: string;
  explorerUrl?: string;
  /** True when the payment never touched a chain — the UI must say so. */
  simulatedPayment?: boolean;
  lineItem?: LineItem;
  failure?: string;
  ratingDelta?: number; // stars just awarded
  dimmed: boolean;
};

export const CATEGORY_LABEL: Record<string, string> = {
  flights: "Flights",
  hotels: "Hotels",
  transport: "Car", // friendly label; the data keys on the trip.ts enum
};

// ---- layout -----------------------------------------------------------------

const COL_X: Record<string, number> = { flights: 620, hotels: 880, transport: 1140 };

// Row pitch must clear the TALLEST state of a card, not the resting state. An
// `answered` card grows a quality bar, the LineItem it sold and the tx-hash chip
// — ~185px against ~95px at rest. Pitch it at 150 and the next card silently
// covers the chip, which is the single most important pixel on the card.
const ROW_Y = [0, 200, 400];
const AGENT_W = 224;

const POS = {
  goal: { x: 0, y: 130 },
  client: { x: 250, y: 120 },
  // Left column, out of the client's way: the client→Rain handoff runs straight
  // down from the client, and it must not appear to pass through the marketplace.
  marketplace: { x: 0, y: 420 },
  // Below the deepest agent row (400 + ~185), since the Rain panel is wide enough
  // to sit under the columns.
  tier2: { x: 250, y: 660 },
};

// ---- the fold ---------------------------------------------------------------

type Fold = {
  goal?: string;
  budgetCents: number;
  agents: Map<string, AgentVisual>;
  columns: Map<string, string[]>; // category → agentIds, sorted by rating desc
  activeCategory?: string;
  reasoning?: string;
  reasoningCategory?: string;
  selected: Map<string, string>; // category → agentId
  openQueries: Map<string, string>; // queryId → category
  paymentAgent: Map<string, string>; // paymentId → agentId
  lastRated?: string;
  cards: Map<string, { last4: string; limitCents: number }>;
  charges: Map<string, { vendor: string; amountCents: number; status: string; reason?: string }>;
  allocations: { domain: string; allocatedCents: number; itemCount: number }[];
  allocationFailures: string[];
  tripItemCount: number;
  handedOff: boolean;
  spentUsdc: number;
  complete: boolean;
};

function blank(): Fold {
  return {
    budgetCents: 0,
    agents: new Map(),
    columns: new Map(),
    selected: new Map(),
    openQueries: new Map(),
    paymentAgent: new Map(),
    cards: new Map(),
    charges: new Map(),
    allocations: [],
    allocationFailures: [],
    tripItemCount: 0,
    handedOff: false,
    spentUsdc: 0,
    complete: false,
  };
}

function fold(events: DemoEvent[]): Fold {
  let f = blank();

  // Only advance an agent's state — a late-arriving event must never drag a paid
  // agent back to `listed`.
  const RANK: Record<AgentState, number> = {
    idle: 0,
    listed: 1,
    considered: 2,
    quoted: 3,
    paying: 4,
    paid: 5,
    responded: 6,
    failed: 7, // terminal: wins over everything
  };
  const advance = (agentId: string, next: AgentState) => {
    const a = f.agents.get(agentId);
    if (!a) return;
    if (a.state === "failed") return;
    if (next === "failed" || RANK[next] > RANK[a.state]) a.state = next;
  };

  for (const e of events) {
    switch (e.type) {
      // A new run is a new board. The server's replay buffer holds up to 500
      // events, which can span several runs — without this the second run's
      // agents, payments and totals accumulate on top of the first one's and the
      // canvas shows a merge of two demos.
      case "run.started":
        f = blank();
        f.goal = e.goal;
        f.budgetCents = e.budgetCents;
        break;

      case "marketplace.query":
        f.activeCategory = e.category;
        f.openQueries.set(e.queryId, e.category);
        // A new category starting retires the previous one's transient state: the
        // rating edge (the spec calls it "brief" — otherwise it animates for the
        // rest of the run and reads as an unfinished action) and the deliberation
        // callout, which would otherwise say "DELIBERATING · HOTELS" while the
        // transport query is already in flight.
        f.lastRated = undefined;
        f.reasoning = undefined;
        f.reasoningCategory = undefined;
        break;

      case "marketplace.results": {
        for (const listing of e.agents) {
          const existing = f.agents.get(listing.agentId);
          f.agents.set(listing.agentId, {
            listing,
            state: existing?.state ?? "listed",
            rating: existing?.rating ?? listing.rating,
            ratingCount: existing?.ratingCount ?? listing.ratingCount,
            quality: existing?.quality,
            txHash: existing?.txHash,
            explorerUrl: existing?.explorerUrl,
            lineItem: existing?.lineItem,
            ratingDelta: existing?.ratingDelta,
            dimmed: false,
          });
          if (!existing) advance(listing.agentId, "listed");
        }
        // Sort once, on arrival — vertical position becomes a free second signal
        // for rating (spec §3). Re-sorting later would make cards jump when a
        // rating is written back.
        f.columns.set(
          e.category,
          [...e.agents].sort((a, b) => b.rating - a.rating).map((a) => a.agentId),
        );
        break;
      }

      case "client.deliberate":
        f.reasoning = e.reasoning;
        f.reasoningCategory = f.openQueries.get(e.queryId);
        for (const id of e.considering) advance(id, "considered");
        break;

      case "client.select": {
        const category = f.openQueries.get(e.queryId);
        if (!category) break;
        f.selected.set(category, e.agentId);
        // The losers stop being candidates. Without this they keep the pulsing
        // `considered` outline for the rest of the run — six cards signalling
        // "still in the running" long after they lost, which is both clutter and
        // a lie. This is the one demotion the state machine allows.
        for (const id of f.columns.get(category) ?? []) {
          const a = f.agents.get(id);
          if (a && id !== e.agentId && a.state === "considered") a.state = "listed";
        }
        break;
      }

      case "payment.challenge":
        f.paymentAgent.set(e.paymentId, e.agentId);
        advance(e.agentId, "quoted");
        break;

      case "payment.signed":
        advance(e.agentId, "paying");
        break;

      case "payment.settled": {
        advance(e.agentId, "paid");
        const a = f.agents.get(e.agentId);
        if (a) {
          a.txHash = e.txHash;
          a.explorerUrl = e.explorerUrl;
          a.simulatedPayment = e.simulated === true;
        }
        // Price comes from the challenge, but only settled payments count.
        const listing = f.agents.get(e.agentId)?.listing;
        if (listing) f.spentUsdc += listing.priceUsdc;
        break;
      }

      case "payment.failed": {
        advance(e.agentId, "failed");
        const a = f.agents.get(e.agentId);
        if (a) a.failure = e.reason;
        break;
      }

      case "agent.response": {
        advance(e.agentId, "responded");
        const a = f.agents.get(e.agentId);
        if (a) {
          a.quality = e.quality;
          a.lineItem = e.lineItem;
        }
        // The query is answered; the discovery edge can retire.
        f.openQueries.delete(e.queryId);
        break;
      }

      case "client.rating": {
        const a = f.agents.get(e.agentId);
        if (a) {
          a.rating = e.newRating;
          a.ratingCount = e.newRatingCount;
          a.ratingDelta = e.stars;
        }
        f.lastRated = e.agentId;
        break;
      }

      case "trip.assembled":
        f.handedOff = true;
        f.tripItemCount = e.trip.items.length;
        // Shopping is over — stop showing the last category's deliberation, which
        // otherwise sits on the final frame reading "DELIBERATING · CAR" long
        // after the client stopped deliberating anything.
        f.reasoning = undefined;
        f.reasoningCategory = undefined;
        // Likewise the last category's rating edge — nothing should still be
        // animating once the trip has been handed off.
        f.lastRated = undefined;
        break;

      case "allocation.ok":
        f.allocations = e.allocations;
        break;

      case "allocation.failed":
        f.allocationFailures = e.reasons;
        break;

      case "tier2.card_issued":
        f.cards.set(e.domain, { last4: e.last4, limitCents: e.limitCents });
        break;

      case "tier2.charge":
        f.charges.set(e.domain, {
          vendor: e.vendor,
          amountCents: e.amountCents,
          status: e.status,
          reason: e.reason,
        });
        break;

      case "run.complete":
        f.complete = true;
        f.activeCategory = undefined; // nothing is "in progress" any more
        break;

      default:
        break;
    }
  }

  // Nine cards at full brightness read as clutter (spec §6). Dim the columns that
  // aren't being shopped — but never dim an agent that already has our money, and
  // never dim anything once the run is done and the whole board is the result.
  if (f.activeCategory && !f.complete) {
    for (const [category, ids] of f.columns) {
      if (category === f.activeCategory) continue;
      for (const id of ids) {
        const a = f.agents.get(id);
        if (a && a.state !== "paid" && a.state !== "responded") a.dimmed = true;
      }
    }
  }

  // A domain whose allocation was rejected is crimson on that domain (spec §3).
  return f;
}

// ---- derive nodes + edges ---------------------------------------------------

export type GraphModel = {
  nodes: AppNode[];
  edges: Edge[];
  reasoning?: string;
  spentUsdc: number;
};

export function buildGraph(events: DemoEvent[]): GraphModel {
  const f = fold(events);
  const nodes: AppNode[] = [];
  const edges: Edge[] = [];

  nodes.push({
    id: "goal",
    type: "goal",
    position: POS.goal,
    data: { goal: f.goal, budgetCents: f.budgetCents },
    draggable: false,
  });

  nodes.push({
    id: "client",
    type: "client",
    position: POS.client,
    data: {
      spentUsdc: f.spentUsdc,
      reasoning: f.reasoning,
      reasoningCategory: f.reasoningCategory,
      complete: f.complete,
    },
    draggable: false,
  });

  nodes.push({
    id: "marketplace",
    type: "marketplace",
    position: POS.marketplace,
    data: { listed: f.agents.size, active: Boolean(f.openQueries.size) },
    draggable: false,
  });

  nodes.push({
    id: "tier2",
    type: "tier2",
    position: POS.tier2,
    data: {
      cards: [...f.cards.entries()].map(([domain, c]) => ({ domain, ...c })),
      charges: [...f.charges.entries()].map(([domain, c]) => ({ domain, ...c })),
      allocations: f.allocations,
      failures: f.allocationFailures,
      handedOff: f.handedOff,
      itemCount: f.tripItemCount,
    },
    draggable: false,
  });

  // Column headers + the nine agent cards.
  for (const [category, ids] of f.columns) {
    const x = COL_X[category] ?? 620;
    nodes.push({
      id: `label-${category}`,
      type: "columnLabel",
      position: { x, y: ROW_Y[0]! - 46 },
      data: {
        label: CATEGORY_LABEL[category] ?? category,
        active: category === f.activeCategory,
        width: AGENT_W,
      },
      draggable: false,
      selectable: false,
    });

    ids.forEach((agentId, row) => {
      const agent = f.agents.get(agentId);
      if (!agent) return;
      nodes.push({
        id: agentId,
        type: "agent",
        position: { x, y: ROW_Y[row] ?? row * 150 },
        data: { agent, selected: f.selected.get(category) === agentId },
        draggable: false,
      });
    });
  }

  // ---- edges ---------------------------------------------------------------
  //
  // Colour must never be the ONLY difference between two edges. Money out and
  // goods in were both green, differing only in lightness — invisible to a
  // colour-blind viewer and to anyone past the third row. So every edge is
  // distinguishable by SHAPE first: solid vs dotted vs dashed, plus an arrowhead
  // that states which way the thing is travelling. Colour is the redundant
  // second signal, not the first.
  const arrow = (color: string) => ({
    type: MarkerType.ArrowClosed,
    color,
    width: 16,
    height: 16,
  });

  edges.push({
    id: "goal-client",
    source: "goal",
    sourceHandle: "out",
    target: "client",
    targetHandle: "in",
    style: { stroke: "var(--border-strong)", strokeWidth: 2 },
  });

  // Discovery — thin and dashed while a query is open, gone once answered.
  if (f.openQueries.size > 0) {
    edges.push({
      id: "discovery",
      source: "client",
      sourceHandle: "down",
      target: "marketplace",
      targetHandle: "in",
      animated: true,
      style: { stroke: "var(--text-faint)", strokeWidth: 1.5, strokeDasharray: "4 4" },
      label: [...f.openQueries.values()][0],
      labelStyle: { fill: "var(--text-dim)", fontSize: 10 },
      labelBgStyle: { fill: "var(--surface)" },
    });
  }

  for (const [agentId, agent] of f.agents) {
    // Payment — client → agent. Amber and animating while in flight, freezing
    // green on settle with the tx hash as the edge label.
    if (agent.state === "quoted" || agent.state === "paying") {
      edges.push({
        id: `pay-${agentId}`,
        source: "client",
        sourceHandle: "out",
        target: agentId,
        targetHandle: "in",
        animated: agent.state === "paying",
        // Solid + arrow at the agent: money leaving the client.
        style: { stroke: "var(--pending)", strokeWidth: 2.5 },
        markerEnd: arrow("#f59e0b"),
        label: `$${agent.listing.priceUsdc} USDC`,
        labelStyle: { fill: "var(--pending)", fontSize: 11, fontWeight: 600 },
        labelBgStyle: { fill: "var(--surface)" },
      });
    } else if (agent.state === "paid" || agent.state === "responded") {
      edges.push({
        id: `pay-${agentId}`,
        source: "client",
        sourceHandle: "out",
        target: agentId,
        targetHandle: "in",
        // Deliberately unlabelled. The tx hash is on the card, and three settled
        // edges fanning across two columns put three hash labels straight on top
        // of other agents' cards — the proof is worth more where it can be read.
        // Solid + thick + arrow at the agent = money that left and settled.
        style: { stroke: "var(--settled)", strokeWidth: 2.5 },
        markerEnd: arrow("#22c55e"),
      });
    } else if (agent.state === "failed") {
      edges.push({
        id: `pay-${agentId}`,
        source: "client",
        sourceHandle: "out",
        target: agentId,
        targetHandle: "in",
        // Crimson is the colour most likely to be confused with the green next to
        // it, so a failure is also the only edge drawn with a long broken dash —
        // and it always carries the reason as text.
        style: { stroke: "var(--halted)", strokeWidth: 2.5, strokeDasharray: "8 4" },
        markerEnd: arrow("#ef4444"),
        label: agent.failure,
        labelStyle: { fill: "var(--halted)", fontSize: 10 },
        labelBgStyle: { fill: "var(--surface)" },
      });
    }

    // Result — agent → client. The LineItem it sold us renders on the card
    // instead of here: as an edge label it lands on whichever card the edge
    // happens to cross, and long labels ("JFK → CDG round trip, Mar 14–21") get
    // truncated into nonsense.
    if (agent.state === "responded" && agent.lineItem) {
      edges.push({
        id: `res-${agentId}`,
        source: agentId,
        sourceHandle: "out",
        target: "client",
        targetHandle: "back",
        // DOTTED and thin, arrow pointing back at the client: information
        // arriving, not money leaving. Shape carries it; the paler green is only
        // a hint. Was previously identical to the payment edge but darker, which
        // told a colour-blind viewer nothing at all.
        style: { stroke: "var(--text-dim)", strokeWidth: 1.5, strokeDasharray: "1 5" },
        markerEnd: arrow("#94a3b8"),
      });
    }
  }

  // Rating — brief, only the most recent one, with the star delta.
  if (f.lastRated) {
    const rated = f.agents.get(f.lastRated);
    edges.push({
      id: "rating",
      source: "client",
      sourceHandle: "down",
      target: "marketplace",
      targetHandle: "in",
      animated: true,
      style: { stroke: "var(--star)", strokeWidth: 1.5 },
      label: `${f.lastRated} +${rated?.ratingDelta ?? ""}★`,
      labelStyle: { fill: "var(--star)", fontSize: 10, fontWeight: 600 },
      labelBgStyle: { fill: "var(--surface)" },
    });
  }

  // Handoff — thick, fires once, the moment tier 1 hands the trip to tier 2.
  if (f.handedOff) {
    const rejected = f.allocationFailures.length > 0;
    edges.push({
      id: "handoff",
      // The CLIENT hands the trip to Rain, not the marketplace. The marketplace is
      // a directory: no fee, never holds funds, never sees the TripRequest. It is
      // the client that assembles it and owns the spend.
      source: "client",
      sourceHandle: "down",
      target: "tier2",
      targetHandle: "in",
      style: {
        stroke: rejected ? "var(--halted)" : "var(--settled)",
        strokeWidth: 4,
      },
      markerEnd: arrow(rejected ? "#ef4444" : "#22c55e"),
      label: rejected ? "rejected" : `TripRequest · ${f.tripItemCount} items`,
      labelStyle: {
        fill: rejected ? "var(--halted)" : "var(--settled)",
        fontSize: 11,
        fontWeight: 600,
      },
      labelBgStyle: { fill: "var(--surface)" },
    });
  }

  return { nodes, edges, reasoning: f.reasoning, spentUsdc: f.spentUsdc };
}
