// The agent card — everything a buyer would weigh, on the face of it.
//
// Names are tier-neutral on purpose (kayak.com tells you nothing about quality),
// so rating and price have to carry the entire signal — and the rating is drawn
// as a filled bar, not just digits, because "4.9" and "3.8" look identical as
// glyphs from the back of a room (spec §3).

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { AgentVisual, AgentState } from "../../state/graph";

const STATE: Record<AgentState, { color: string; label: string }> = {
  idle: { color: "var(--text-faint)", label: "" },
  listed: { color: "var(--text-faint)", label: "listed" },
  considered: { color: "var(--text)", label: "considering" },
  quoted: { color: "var(--pending)", label: "402 quoted" },
  paying: { color: "var(--pending)", label: "paying" },
  paid: { color: "var(--settled)", label: "paid" },
  responded: { color: "var(--settled)", label: "answered" },
  failed: { color: "var(--halted)", label: "failed" },
};

export default function AgentNode({ data }: NodeProps) {
  const { agent, selected } = data as unknown as { agent: AgentVisual; selected: boolean };
  const state = STATE[agent.state];
  const isConsidering = agent.state === "considered";

  return (
    <div
      style={{
        width: 224,
        background: "var(--surface-raised)",
        border: `1px solid ${
          isConsidering || selected ? state.color : "var(--border)"
        }`,
        borderLeft: `3px solid ${state.color}`,
        borderRadius: 8,
        padding: "10px 12px",
        opacity: agent.dimmed ? 0.35 : 1,
        transition: "opacity 500ms ease, border-color 300ms ease",
        animation: isConsidering ? "pulse-outline 1.4s ease-in-out infinite" : undefined,
      }}
    >
      <Handle type="target" id="in" position={Position.Left} style={HANDLE(35)} />
      <Handle type="source" id="out" position={Position.Left} style={HANDLE(70)} />

      {/* name + state dot */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{agent.listing.name}</span>
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: state.color,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 9,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: state.color,
            minWidth: 58,
            textAlign: "right",
          }}
        >
          {state.label}
        </span>
      </div>

      <StarBar rating={agent.rating} count={agent.ratingCount} delta={agent.ratingDelta} />

      {/* Price gets equal visual weight to rating — the tension between them IS
          the decision, so price must not read as small print. */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginTop: 6,
        }}
      >
        <span style={{ fontFamily: "var(--mono)", fontSize: 15, fontWeight: 600 }}>
          ${agent.listing.priceUsdc.toFixed(2)}
        </span>
        <span style={{ fontSize: 9, color: "var(--text-faint)", letterSpacing: "0.06em" }}>
          USDC / QUERY
        </span>
      </div>

      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: 9,
          color: "var(--text-faint)",
          marginTop: 3,
        }}
      >
        {agent.listing.wallet.slice(0, 6)}…{agent.listing.wallet.slice(-4)}
      </div>

      {/* Quality only exists once we've paid and been answered. */}
      {agent.quality !== undefined && (
        <>
          <div style={{ borderTop: "1px solid var(--border)", margin: "8px -12px 7px" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontSize: 9, color: "var(--text-dim)", letterSpacing: "0.06em" }}>
              QUALITY
            </span>
            <div
              style={{
                flex: 1,
                height: 5,
                background: "var(--star-empty)",
                borderRadius: 3,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${agent.quality * 100}%`,
                  height: "100%",
                  background: "var(--settled)",
                  transition: "width 600ms ease",
                }}
              />
            </div>
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--settled)" }}>
              {agent.quality.toFixed(2)}
            </span>
          </div>
        </>
      )}

      {/* What we actually bought. On the card rather than on the result edge —
          an edge label this long lands on top of whatever card the edge crosses. */}
      {agent.lineItem && (
        <div
          style={{
            marginTop: 6,
            fontSize: 10,
            lineHeight: 1.35,
            color: "var(--text-dim)",
          }}
        >
          {agent.lineItem.label}
          <span style={{ color: "var(--text-faint)" }}>
            {" "}
            · ${(agent.lineItem.maxSpend.amountCents / 100).toFixed(0)} cap
          </span>
        </div>
      )}

      {/* The on-chain proof — the thing a judge leans in for, so it gets a real
          chip instead of 9px text that disappears on a projector. Clickable when
          the emitter sent an explorerUrl. */}
      {agent.txHash && (
        <a
          href={agent.explorerUrl ?? undefined}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => {
            if (!agent.explorerUrl) e.preventDefault();
          }}
          style={{
            display: "inline-block",
            marginTop: 7,
            fontFamily: "var(--mono)",
            fontSize: 10,
            color: "var(--settled)",
            background: "var(--settled-dim)",
            border: "1px solid var(--settled)",
            borderRadius: 4,
            padding: "2px 6px",
            textDecoration: "none",
            cursor: agent.explorerUrl ? "pointer" : "default",
          }}
        >
          ⛓ {agent.txHash.slice(0, 12)}…
        </a>
      )}
    </div>
  );
}

/** Filled bar + numeral + count. The bar is the part that reads from a distance. */
function StarBar({
  rating,
  count,
  delta,
}: {
  rating: number;
  count: number;
  delta?: number;
}) {
  const pct = Math.max(0, Math.min(100, (rating / 5) * 100));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ position: "relative", lineHeight: 1, fontSize: 13, letterSpacing: 1 }}>
        <span style={{ color: "var(--star-empty)" }}>★★★★★</span>
        <span
          style={{
            position: "absolute",
            inset: 0,
            width: `${pct}%`,
            overflow: "hidden",
            whiteSpace: "nowrap",
            color: "var(--star)",
            transition: "width 500ms ease",
          }}
        >
          ★★★★★
        </span>
      </div>
      <span style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600 }}>
        {rating.toFixed(1)}
      </span>
      <span style={{ fontSize: 10, color: "var(--text-faint)" }}>({count.toLocaleString()})</span>
      {/* The average barely moves against hundreds of ratings — the count tick and
          this flash are the visible signal that the write-back happened. */}
      {delta !== undefined && (
        <span style={{ fontSize: 10, color: "var(--star)", fontWeight: 600 }}>+{delta}★</span>
      )}
    </div>
  );
}

const HANDLE = (topPct: number) => ({
  top: `${topPct}%`,
  opacity: 0,
  width: 1,
  height: 1,
  border: "none",
  minWidth: 1,
  minHeight: 1,
});
