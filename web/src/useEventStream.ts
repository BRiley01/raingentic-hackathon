// One hook, one mode, identical events either way.
//
// Both sources yield the same DemoEvent shape, so everything downstream is
// source-agnostic — which is what makes the simulator a credible showtime
// fallback rather than a separate codepath that rots.

import { useEffect, useState } from "react";
import type { DemoEvent } from "@shared/events/types.js";
import { framesUpTo, runMock } from "./mock/run.js";
import { resolveMode, type Mode } from "./mode.js";

export type StreamStatus = "idle" | "connecting" | "open" | "error";

export function useEventStream() {
  const { mode, frame, speed } = resolveMode();

  const [events, setEvents] = useState<DemoEvent[]>([]);
  // The server replays its whole ring buffer to every new connection — that's the
  // demo insurance that survives a mid-demo refresh. The cost is that a run from
  // hours ago looks exactly like one happening now, and no amount of refreshing
  // changes it because the buffer lives in the server process. So track how old
  // the newest event is and let the UI say so.
  const [now, setNow] = useState(() => Date.now());
  // Live mode can legitimately be silent for a long time (nothing has called
  // emit() yet). Surfacing the connection state separately means "empty" and
  // "broken" don't look the same on stage.
  const [status, setStatus] = useState<StreamStatus>("idle");

  useEffect(() => {
    // Fresh run on (re)mount — React's StrictMode double-invoke would otherwise
    // interleave two playbacks into one list.
    setEvents([]);

    if (mode === "simulator") {
      setStatus("open");
      if (frame !== undefined) {
        setEvents(framesUpTo(frame));
        return;
      }
      return runMock((event) => setEvents((prev) => [...prev, event]), { speed });
    }

    setStatus("connecting");
    const es = new EventSource("/api/events");
    es.onopen = () => setStatus("open");
    es.onerror = () => setStatus("error");
    es.onmessage = (msg) => {
      setStatus("open");
      const event = JSON.parse(msg.data) as DemoEvent;
      // The server replays its buffer on connect and the browser auto-resumes
      // with Last-Event-ID, so the same seq can legitimately arrive twice.
      setEvents((prev) => (prev.some((e) => e.seq === event.seq) ? prev : [...prev, event]));
    };
    return () => es.close();
  }, [mode, speed, frame]);

  // Staleness has to advance without new events arriving, so it needs its own
  // tick. Live only — the simulator's timestamps are always "now".
  useEffect(() => {
    if (mode !== "live") return;
    const t = setInterval(() => setNow(Date.now()), 3_000);
    return () => clearInterval(t);
  }, [mode]);

  const lastTs = events.length ? events[events.length - 1]!.ts : undefined;

  return {
    events,
    mode: mode as Mode,
    status,
    /** Age of the newest event, ms. undefined when nothing has arrived. */
    ageMs: mode === "live" && lastTs ? Math.max(0, now - lastTs) : undefined,
  };
}

/**
 * Clear the server's replay buffer and reload. The only way to get out of
 * "showing a run from an hour ago", since the buffer outlives every page load.
 */
export async function clearLiveHistory(): Promise<void> {
  await fetch("/api/events/reset", { method: "POST" }).catch(() => {});
  window.location.reload();
}
