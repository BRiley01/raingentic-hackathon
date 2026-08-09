// Raw event tail. Not part of the final demo composition, but keep it behind a
// toggle: when a beat doesn't render right, the first question is always "did the
// event arrive, and in what order?" — and this answers it in one glance.

import { useEffect, useMemo, useRef } from "react";
import type { DemoEvent } from "@shared/events/types.js";

const ACCENT: Record<string, string> = {
  "payment.challenge": "var(--pending)",
  "payment.signed": "var(--pending)",
  "payment.settled": "var(--settled)",
  "agent.response": "var(--settled)",
  "payment.failed": "var(--halted)",
  "allocation.failed": "var(--halted)",
};

export default function EventLog({ events }: { events: DemoEvent[] }) {
  const endRef = useRef<HTMLDivElement>(null);

  // agentId is an opaque UUID, so every event that names an agent would otherwise
  // render as `dcd84bff…`. marketplace.results is the one event carrying both the id
  // and the name, so it's the join. Falls back to the raw id for an agent we somehow
  // never saw listed — better a UUID than a blank.
  const nameOf = useMemo(() => {
    const names = new Map<string, string>();
    for (const e of events) {
      if (e.type === "marketplace.results") {
        for (const a of e.agents) names.set(a.agentId, a.name ?? a.agentId);
      }
    }
    return (agentId: string) => names.get(agentId) ?? agentId;
  }, [events.length]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [events.length]);

  return (
    <aside
      style={{
        width: 340,
        flexShrink: 0,
        borderLeft: "1px solid var(--border)",
        background: "var(--surface)",
        overflowY: "auto",
        fontFamily: "var(--mono)",
        fontSize: 11,
        lineHeight: 1.5,
        padding: "12px 14px",
      }}
    >
      <div
        style={{
          color: "var(--text-dim)",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          fontSize: 10,
          marginBottom: 10,
        }}
      >
        event log · {events.length}
      </div>

      {events.map((e) => (
        <div key={e.seq} style={{ marginBottom: 6, display: "flex", gap: 8 }}>
          <span style={{ color: "var(--text-faint)", minWidth: 20, textAlign: "right" }}>
            {e.seq}
          </span>
          <span>
            <span style={{ color: ACCENT[e.type] ?? "var(--text)" }}>{e.type}</span>
            <span style={{ color: "var(--text-faint)" }}> {detail(e, nameOf)}</span>
          </span>
        </div>
      ))}
      <div ref={endRef} />
    </aside>
  );
}

/** The one field that matters per event type — enough to follow the run. */
function detail(e: DemoEvent, nameOf: (agentId: string) => string): string {
  switch (e.type) {
    case "run.started":
      return `$${(e.budgetCents / 100).toFixed(0)} budget`;
    case "marketplace.query":
      return e.category;
    case "marketplace.results":
      return `${e.category} · ${e.agents.length} agents`;
    case "client.deliberate":
      return `${e.considering.length} candidates`;
    case "client.select":
      return nameOf(e.agentId);
    case "payment.challenge":
      return `${nameOf(e.agentId)} · $${e.amountUsdc}`;
    case "payment.signed":
      return nameOf(e.agentId);
    case "payment.settled":
      // No txHash on a simulated payment — there's no transaction to show.
      return e.txHash
        ? `${nameOf(e.agentId)} · ${e.txHash.slice(0, 10)}… · ${e.durationMs}ms`
        : `${nameOf(e.agentId)} · simulated`;
    case "payment.failed":
      return `${nameOf(e.agentId)} · ${e.reason}`;
    case "agent.response":
      return `${nameOf(e.agentId)} · q=${e.quality}`;
    case "client.rating":
      return `${nameOf(e.agentId)} · ${e.stars}★ → ${e.newRating} (${e.newRatingCount})`;
    case "trip.assembled":
      return `${e.trip.items.length} items`;
    case "allocation.ok":
      return `${e.allocations.length} domains`;
    case "allocation.failed":
      return e.reasons.join("; ");
    case "tier2.card_issued":
      return `${e.domain} · •${e.last4} · $${(e.limitCents / 100).toFixed(0)} limit`;
    case "tier2.charge":
      return `${e.vendor} · $${(e.amountCents / 100).toFixed(2)} · ${e.status}`;
    case "run.complete":
      return `$${e.tier1SpentUsdc} → $${(e.tier2SettledCents / 100).toFixed(2)}`;
    default:
      return "";
  }
}
