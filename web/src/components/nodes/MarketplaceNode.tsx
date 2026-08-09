// The marketplace: a directory, nothing more. It takes no fee and never touches
// the money — so it has no balance to show, only listings.

import { Handle, Position, type NodeProps } from "@xyflow/react";

export default function MarketplaceNode({ data }: NodeProps) {
  const { listed, active } = data as unknown as { listed: number; active: boolean };

  return (
    <div
      style={{
        width: 230,
        background: "var(--surface-raised)",
        border: `1px solid ${active ? "var(--text-dim)" : "var(--border)"}`,
        borderRadius: 8,
        padding: "12px 14px",
        transition: "border-color 300ms ease",
      }}
    >
      <Handle type="target" id="in" position={Position.Top} style={HANDLE} />
      <Handle type="source" id="down" position={Position.Bottom} style={HANDLE} />

      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--text-dim)",
        }}
      >
        Marketplace
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginTop: 3 }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 20, fontWeight: 600 }}>{listed}</span>
        <span style={{ fontSize: 12, color: "var(--text-dim)" }}>agents listed</span>
      </div>
      <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 5 }}>
        no fee · never holds funds
      </div>
    </div>
  );
}

const HANDLE = { opacity: 0, width: 1, height: 1, border: "none", minWidth: 1, minHeight: 1 };
