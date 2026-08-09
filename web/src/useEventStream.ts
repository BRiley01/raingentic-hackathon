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

  return { events, mode: mode as Mode, status };
}
