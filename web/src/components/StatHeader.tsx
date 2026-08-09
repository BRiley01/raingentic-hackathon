// The stat that lands (spec §3).
//
// Fractions of a cent bought the decisions; the decisions moved $1,714. That
// juxtaposition IS the pitch, so both numbers are large and side by side. Values
// are props with zeroed defaults — the reducer feeds them in step 7.

import { MODE_DESCRIPTION, MODE_LABEL, MODES, modeHref, type Mode } from "../mode";
import { clearLiveHistory, type StreamStatus } from "../useEventStream";

type Props = {
  tier1SpentUsdc?: number;
  agentCount?: number;
  agentsPaid?: number;
  tier2SettledCents?: number;
  cardCount?: number;
  goal?: string;
  budgetCents?: number;
  complete?: boolean;
  /** Which mode is driving the canvas. Never demo the wrong one by accident. */
  mode?: Mode;
  /** Live only: whether the stream is actually connected. */
  status?: StreamStatus;
  /** Live only: age of the newest event, ms. */
  ageMs?: number;
};

/**
 * How old the newest event may be before we stop implying it's happening now. A
 * live run's own beats are ≤2s apart, so anything past this is history being
 * replayed out of the server's buffer.
 */
const STALE_AFTER_MS = 20_000;

const age = (ms: number) =>
  ms < 60_000 ? `${Math.round(ms / 1000)}s` : `${Math.round(ms / 60_000)}m`;

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
  mode = "simulator",
  status = "idle",
  ageMs,
}: Props) {
  const replayed = mode === "live" && ageMs !== undefined && ageMs > STALE_AFTER_MS;
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
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
          {/* Nothing else on screen distinguishes a run happening now from one
              replayed out of the server's buffer, and refreshing won't clear it —
              so say it plainly, and offer the only thing that does. */}
          {replayed && (
            <button
              onClick={clearLiveHistory}
              title="This is history replayed from the server's buffer, not live activity. Clear it and reload."
              style={{
                fontSize: 11,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--pending)",
                background: "transparent",
                border: "1px solid var(--pending)",
                borderRadius: 999,
                padding: "4px 10px",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              replayed · {age(ageMs!)} old · clear
            </button>
          )}
          <ModeSwitch mode={mode} status={status} />
          {/* Real vendor names, synthetic ratings — say so, so nobody reads the
              numbers as real assessments (spec §1). */}
          <Chip>simulated data</Chip>
        </div>
      </div>
    </header>
  );
}

/**
 * A real control, not a label. Switching mode is a full reload on purpose: a fresh
 * EventSource or a fresh simulator run, with no state carried across from the mode
 * you just left.
 */
function ModeSwitch({ mode, status }: { mode: Mode; status: StreamStatus }) {
  return (
    <div
      style={{
        display: "flex",
        border: "1px solid var(--border-strong)",
        borderRadius: 999,
        overflow: "hidden",
      }}
    >
      {MODES.map((m) => {
        const active = m === mode;
        // Amber while a live stream is connecting, crimson if it dropped. Silence
        // and breakage must not look the same on stage.
        const liveColor =
          status === "error" ? "var(--halted)" : status === "open" ? "var(--settled)" : "var(--pending)";
        const activeColor = m === "live" ? liveColor : "var(--text)";
        return (
          <a
            key={m}
            href={modeHref(m)}
            title={MODE_DESCRIPTION[m]}
            style={{
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: "4px 11px",
              textDecoration: "none",
              color: active ? "var(--bg)" : "var(--text-faint)",
              background: active ? activeColor : "transparent",
              fontWeight: active ? 600 : 400,
            }}
          >
            {MODE_LABEL[m]}
            {active && m === "live" && status !== "open" ? ` · ${status}` : ""}
          </a>
        );
      })}
    </div>
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
