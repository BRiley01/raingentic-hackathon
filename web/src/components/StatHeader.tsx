// The stat that lands (spec §3).
//
// Fractions of a cent bought the decisions; the decisions moved $1,714. That
// juxtaposition IS the pitch, so both numbers are large and side by side. Values
// are props with zeroed defaults — the reducer feeds them in step 7.

type Props = {
  tier1SpentUsdc?: number;
  agentCount?: number;
  agentsPaid?: number;
  tier2SettledCents?: number;
  cardCount?: number;
  goal?: string;
  budgetCents?: number;
  complete?: boolean;
  /** Which source is driving the canvas. Never demo the wrong one by accident. */
  source?: "mock" | "live";
};

const usd = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function StatHeader({
  tier1SpentUsdc = 0,
  agentCount = 0,
  agentsPaid = 0,
  tier2SettledCents = 0,
  cardCount = 0,
  goal,
  complete = false,
  source = "mock",
}: Props) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 56,
        padding: "18px 28px",
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {/* "Tier 1 / Tier 2" is our internal jargon — it means nothing to a judge.
          On screen we lead with what the money BOUGHT and name the rail
          underneath. The event types keep the tier names; renaming those would
          break the published contract. */}
      <Stat
        label="Paid for advice"
        value={`$${tier1SpentUsdc.toFixed(2)} USDC`}
        sub={`${agentCount} agents · ${agentsPaid} paid`}
        rail="x402 · Monad"
      />
      <Stat
        label="Spent on the trip"
        value={usd(tier2SettledCents)}
        sub={`${cardCount} scoped cards`}
        rail="Rain"
        // Green is reserved for settled money — so it only appears once the run
        // has actually completed, never as decoration.
        accent={complete ? "var(--settled)" : undefined}
      />

      <div style={{ marginLeft: "auto", textAlign: "right" }}>
        {goal && (
          <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 8, maxWidth: 340 }}>
            {goal}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          {/* Which source is driving this. Knowing at a glance whether you're on
              the mock or the live chain matters more at 2am than it sounds. */}
          <Chip color={source === "live" ? "var(--settled)" : "var(--text-faint)"}>
            {source === "live" ? "live" : "mock"}
          </Chip>
          {/* Real vendor names, synthetic ratings — say so, so nobody reads the
              numbers as real assessments (spec §1). */}
          <Chip>simulated data</Chip>
        </div>
      </div>
    </header>
  );
}

function Chip({ children, color = "var(--text-faint)" }: { children: string; color?: string }) {
  return (
    <span
      style={{
        fontSize: 11,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color,
        border: `1px solid ${color === "var(--text-faint)" ? "var(--border-strong)" : color}`,
        borderRadius: 999,
        padding: "4px 10px",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function Stat({
  label,
  value,
  sub,
  rail,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  rail: string;
  accent?: string;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--text-dim)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: 34,
          fontWeight: 600,
          lineHeight: 1.15,
          fontVariantNumeric: "tabular-nums",
          color: accent ?? "var(--text)",
          transition: "color 400ms ease",
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12, color: "var(--text-faint)" }}>{sub}</div>
      {/* Naming the rail is free sponsor recognition — judges know these two. */}
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--text-faint)",
          marginTop: 4,
        }}
      >
        {rail}
      </div>
    </div>
  );
}
