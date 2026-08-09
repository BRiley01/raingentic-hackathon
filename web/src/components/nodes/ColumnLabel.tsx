// Category header above each column of three. Renders the friendly label ("Car")
// while everything underneath keys on the trip.ts enum ("transport").

import type { NodeProps } from "@xyflow/react";

export default function ColumnLabel({ data }: NodeProps) {
  const { label, active, width } = data as unknown as {
    label: string;
    active: boolean;
    width: number;
  };

  return (
    <div
      style={{
        width,
        textAlign: "center",
        fontSize: 11,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: active ? "var(--text)" : "var(--text-faint)",
        paddingBottom: 6,
        borderBottom: `1px solid ${active ? "var(--border-strong)" : "var(--border)"}`,
        transition: "color 400ms ease",
      }}
    >
      {label}
      <div style={{ fontSize: 8, letterSpacing: "0.1em", color: "var(--text-faint)", marginTop: 3 }}>
        sorted by rating
      </div>
    </div>
  );
}
