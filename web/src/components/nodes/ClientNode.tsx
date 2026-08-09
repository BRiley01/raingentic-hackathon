// The client agent — the thing doing the shopping, and the only node that spends.
//
// The reasoning callout is the highest-value pixel on the canvas: watching an
// agent explain a spending decision in its own words beats any animation, so it
// renders verbatim and is given room to breathe.

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { CATEGORY_LABEL } from "../../state/graph";

export default function ClientNode({ data }: NodeProps) {
  const { spentUsdc, reasoning, reasoningCategory, complete } = data as unknown as {
    spentUsdc: number;
    reasoning?: string;
    reasoningCategory?: string;
    complete: boolean;
  };

  return (
    <div style={{ width: 230 }}>
      <div
        style={{
          background: "var(--surface-raised)",
          border: `1px solid ${complete ? "var(--settled)" : "var(--border-strong)"}`,
          borderRadius: 8,
          padding: "12px 14px",
          transition: "border-color 400ms ease",
        }}
      >
        <Handle type="target" id="in" position={Position.Left} style={HANDLE("50%")} />
        <Handle type="source" id="out" position={Position.Right} style={HANDLE("32%")} />
        <Handle type="target" id="back" position={Position.Right} style={HANDLE("68%")} />
        <Handle type="source" id="down" position={Position.Bottom} style={HANDLE()} />

        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--text-dim)",
          }}
        >
          Client agent
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>the buyer</div>

        <div style={{ borderTop: "1px solid var(--border)", margin: "10px -14px" }} />

        <div style={{ fontSize: 10, color: "var(--text-faint)", letterSpacing: "0.06em" }}>
          SPENT ON ADVICE
        </div>
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: 22,
            fontWeight: 600,
            fontVariantNumeric: "tabular-nums",
            color: spentUsdc > 0 ? "var(--settled)" : "var(--text)",
          }}
        >
          ${spentUsdc.toFixed(2)}
        </div>
      </div>

      {reasoning && (
        <div
          style={{
            marginTop: 8,
            background: "var(--surface)",
            border: "1px solid var(--border-strong)",
            borderLeft: "3px solid var(--text)",
            borderRadius: 6,
            padding: "9px 11px",
            fontSize: 11,
            lineHeight: 1.45,
            color: "var(--text)",
          }}
        >
          {reasoningCategory && (
            <div
              style={{
                fontSize: 9,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--text-faint)",
                marginBottom: 4,
              }}
            >
              deliberating · {CATEGORY_LABEL[reasoningCategory] ?? reasoningCategory}
            </div>
          )}
          “{reasoning}”
        </div>
      )}
    </div>
  );
}

// Handles are invisible — they exist only as edge anchors. Two on the same side
// need distinct offsets so the payment-out and result-in edges don't overlap.
const HANDLE = (top?: string) => ({
  ...(top ? { top } : {}),
  opacity: 0,
  width: 1,
  height: 1,
  border: "none",
  minWidth: 1,
  minHeight: 1,
});
