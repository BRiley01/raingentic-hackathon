// What am I looking at?
//
// There used to be `?live=1`, `?mock=1`, `?frame=`, `?speed=` — four flags that
// accreted one at a time, with no single answer to that question. Now there is
// exactly one mode, it is named, and it is displayed in the header:
//
//   ?mode=simulator   (default) a scripted run. No backend, no chain, no wallets.
//   ?mode=live        render whatever the backend is actually emitting.
//
// LIVE MEANS "SHOW ME THE REAL STREAM" — it does not claim any particular part of
// the system is real. How much of a live run is genuinely on-chain is the
// backend's business; the canvas reports what arrived and nothing more. That
// distinction matters on stage: we should never be in a position where the UI
// implies a settlement happened that didn't.
//
// `frame` and `speed` are simulator-only, because scrubbing and fast-forwarding a
// live stream are meaningless. They are deliberately NOT modes — they're controls
// on the simulator.

export type Mode = "simulator" | "live";

export const MODES: Mode[] = ["simulator", "live"];

export type ModeConfig = {
  mode: Mode;
  /** Simulator only: freeze at beat N with no timers running. */
  frame?: number;
  /** Simulator only: playback multiplier (2 = twice as fast). */
  speed: number;
};

export const MODE_LABEL: Record<Mode, string> = {
  simulator: "simulator",
  live: "live",
};

export const MODE_DESCRIPTION: Record<Mode, string> = {
  simulator: "Scripted run — no backend, no chain, no wallets",
  live: "Rendering the backend's real event stream from /api/events",
};

export function resolveMode(search: string = window.location.search): ModeConfig {
  const params = new URLSearchParams(search);

  const raw = (params.get("mode") ?? "").toLowerCase();
  const mode: Mode = raw === "live" ? "live" : "simulator";

  const frameRaw = params.get("frame");
  const speedRaw = Number(params.get("speed"));

  return {
    mode,
    // Ignored outside the simulator rather than silently half-working.
    frame: mode === "simulator" && frameRaw !== null ? Number(frameRaw) : undefined,
    speed: mode === "simulator" && speedRaw > 0 ? speedRaw : 1,
  };
}

/**
 * The URL for switching modes, preserving nothing else — a mode switch is a fresh
 * start, and carrying a stale `frame` into a new mode is how you end up demoing a
 * frozen canvas and thinking the stream is dead.
 */
export function modeHref(mode: Mode): string {
  const params = new URLSearchParams();
  if (mode !== "simulator") params.set("mode", mode);
  const query = params.toString();
  return `${window.location.pathname}${query ? `?${query}` : ""}`;
}
