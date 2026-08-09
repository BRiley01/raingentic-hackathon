// SSE endpoint for the live demo canvas.
//
//   GET  /api/events            stream (replays the buffer, then follows live)
//   GET  /api/events?since=42   stream, replaying only events after seq 42
//   GET  /api/events/history    plain JSON snapshot, no streaming
//   POST /api/events/reset      clear the buffer between demo runs
//
// The browser reconnects on its own and sends `Last-Event-ID`, so a dropped
// connection self-heals without losing a single event.

import express from "express";
import { emit, subscribe, since, history, reset, subscriberCount } from "../../events/bus.js";
import type { DemoEvent } from "../../events/types.js";

const router = express.Router();

const HEARTBEAT_MS = 15_000;

router.get("/events", (req: any, res: any) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // Without this, some proxies buffer the whole stream and the UI stays blank
    // until the run ends.
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();

  // Flush a comment immediately. Headers alone don't reach the browser through an
  // intermediary (the Vite dev proxy included) until some body follows, so without
  // this EventSource never fires `onopen` on a stream that has nothing buffered —
  // and the UI cannot tell "connected but quiet" from "still connecting".
  res.write(": connected\n\n");

  const write = (event: DemoEvent) => {
    res.write(`id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`);
  };

  // `Last-Event-ID` is set by the browser on auto-reconnect; `?since=` is the
  // manual equivalent. Either way we replay the gap before going live.
  const lastId = Number(req.headers["last-event-id"] ?? req.query.since ?? 0);
  const from = Number.isFinite(lastId) && lastId > 0 ? lastId : 0;
  for (const event of since(from)) write(event);

  const unsubscribe = subscribe(write);
  const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

router.get("/events/history", (_req: any, res: any) => {
  res.json({ events: history(), subscribers: subscriberCount() });
});

router.post("/events/reset", (_req: any, res: any) => {
  reset();
  res.json({ ok: true });
});

// Escape hatch for hand-driving the canvas (and for anyone whose language of
// choice isn't TypeScript): POST an event instead of importing `emit`.
router.post("/events/emit", (req: any, res: any) => {
  const { type, ...payload } = req.body ?? {};
  if (!type) return res.status(400).json({ error: "type is required" });
  res.json(emit(type, payload));
});

export default router;
