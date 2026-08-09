// Where the run starts: the human's goal and the hard ceiling on it.

import { Handle, Position, type NodeProps } from "@xyflow/react";

export default function GoalNode({ data }: NodeProps) {
  const { goal, budgetCents } = data as unknown as { goal?: string; budgetCents: number };

  return (
    <div
      style={{
        width: 200,
        background: "var(--surface)",
        border: "1px dashed var(--border-strong)",
        borderRadius: 8,
        padding: "12px 14px",
      }}
    >
      <Handle type="source" id="out" position={Position.Right} style={HANDLE} />

      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--text-dim)",
        }}
      >
        Goal
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.4, marginTop: 5, color: "var(--text)" }}>
        {goal ?? "waiting for run.started…"}
      </div>
      {budgetCents > 0 && (
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: 18,
            fontWeight: 600,
            marginTop: 8,
          }}
        >
          ${(budgetCents / 100).toLocaleString("en-US")}
          <span style={{ fontSize: 10, color: "var(--text-faint)", marginLeft: 5 }}>CEILING</span>
        </div>
      )}
    </div>
  );
}

const HANDLE = { opacity: 0, width: 1, height: 1, border: "none", minWidth: 1, minHeight: 1 };
