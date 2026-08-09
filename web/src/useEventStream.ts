// One hook, two sources, identical events.
//
//   /            → the scripted mock (no backend needed)
//   /?live=1     → the real SSE stream at /api/events
//   /?speed=2    → play the mock twice as fast (rehearsal)
//
// Because both sources yield the same DemoEvent shape, everything downstream is
// source-agnostic — which is what makes `?mock=1` a credible showtime fallback
// rather than a separate codepath that rots.

import { useEffect, useState } from "react";
import type { DemoEvent } from "@shared/events/types.js";
import { framesUpTo, runMock } from "./mock/run.js";

export type StreamSource = "mock" | "live";

export function useEventStream() {
  const params = new URLSearchParams(window.location.search);
  const source: StreamSource = params.get("live") === "1" ? "live" : "mock";
  const speed = Number(params.get("speed") ?? 1);
  // `?frame=n` freezes the canvas at beat n with no timers running: reproducible
  // screenshots, and a way to jump straight to the beat you're working on.
  const frame = params.get("frame");

  const [events, setEvents] = useState<DemoEvent[]>([]);

  useEffect(() => {
    // Fresh run on (re)mount — React's StrictMode double-invoke would otherwise
    // interleave two mock playbacks into one list.
    setEvents([]);

    if (frame !== null) {
      setEvents(framesUpTo(Number(frame)));
      return;
    }

    if (source === "mock") {
      return runMock((event) => setEvents((prev) => [...prev, event]), { speed });
    }

    const es = new EventSource("/api/events");
    es.onmessage = (msg) => {
      const event = JSON.parse(msg.data) as DemoEvent;
      // The server replays its buffer on connect and the browser auto-resumes
      // with Last-Event-ID, so the same seq can legitimately arrive twice.
      setEvents((prev) => (prev.some((e) => e.seq === event.seq) ? prev : [...prev, event]));
    };
    return () => es.close();
  }, [source, speed, frame]);

  return { events, source };
}
