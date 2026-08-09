// Tier 2 — where the advice turns into money that matters.
//
// Labelled "Rain · scoped cards" rather than "tier 2": internal tier language
// means nothing to a judge. One slot per domain, each showing its card, its limit
// and what the merchant actually took.

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { CATEGORY_LABEL } from "../../state/graph";

type Card = { domain: string; last4: string; limitCents: number };
type Charge = { domain: string; vendor: string; amountCents: number; status: string; reason?: string };

const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

export default function Tier2Node({ data }: NodeProps) {
  const { cards, charges, failures, handedOff, itemCount } = data as unknown as {
    cards: Card[];
    charges: Charge[];
    failures: string[];
    handedOff: boolean;
    itemCount: number;
  };

  const rejected = failures.length > 0;
  const settled = charges
    .filter((c) => c.status === "settled")
    .reduce((sum, c) => sum + c.amountCents, 0);

  return (
    <div
      style={{
        width: 700,
        background: "var(--surface-raised)",
        border: `1px solid ${
          rejected ? "var(--halted)" : settled > 0 ? "var(--settled)" : "var(--border)"
        }`,
        borderRadius: 8,
        padding: "12px 14px",
        opacity: handedOff ? 1 : 0.45,
        transition: "opacity 500ms ease, border-color 400ms ease",
      }}
    >
      <Handle type="target" id="in" position={Position.Top} style={HANDLE} />

      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
        <span
          style={{
            fontSize: 10,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--text-dim)",
          }}
        >
          Rain · scoped cards
        </span>
        <span style={{ fontSize: 10, color: "var(--text-faint)" }}>
          {handedOff ? `${itemCount} line items received` : "awaiting trip.assembled"}
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontFamily: "var(--mono)",
            fontSize: 20,
            fontWeight: 600,
            color: settled > 0 ? "var(--settled)" : "var(--text-faint)",
          }}
        >
          {usd(settled)}
        </span>
      </div>

      {/* The allocator refusing a plan is a real guardrail firing live — show
          every violated rule, never just the first. */}
      {rejected && (
        <div
          style={{
            border: "1px solid var(--halted)",
            background: "var(--halted-dim)",
            borderRadius: 6,
            padding: "8px 10px",
            marginBottom: 10,
            fontSize: 11,
          }}
        >
          <strong style={{ color: "var(--halted)" }}>allocation rejected</strong>
          <ul style={{ margin: "4px 0 0", paddingLeft: 16, color: "var(--text)" }}>
            {failures.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        {["flights", "hotels", "transport"].map((domain) => {
          const card = cards.find((c) => c.domain === domain);
          const charge = charges.find((c) => c.domain === domain);
          const isSettled = charge?.status === "settled";
          const declined = charge?.status === "declined";
          const color = declined
            ? "var(--halted)"
            : isSettled
              ? "var(--settled)"
              : card
                ? "var(--pending)"
                : "var(--border)";

          return (
            <div
              key={domain}
              style={{
                flex: 1,
                border: `1px solid ${color}`,
                borderRadius: 6,
                padding: "8px 10px",
                background: "var(--surface)",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--text-dim)",
                }}
              >
                {CATEGORY_LABEL[domain] ?? domain}
              </div>

              {card ? (
                <>
                  <div
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 12,
                      marginTop: 4,
                      color: "var(--text)",
                    }}
                  >
                    •••• {card.last4}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-faint)" }}>
                    limit {usd(card.limitCents)}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 4 }}>
                  no card yet
                </div>
              )}

              {charge && (
                <div style={{ marginTop: 6, borderTop: "1px solid var(--border)", paddingTop: 5 }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 600, color }}>
                    {usd(charge.amountCents)}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-faint)" }}>
                    {charge.vendor} · {charge.status}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const HANDLE = { opacity: 0, width: 1, height: 1, border: "none", minWidth: 1, minHeight: 1 };
