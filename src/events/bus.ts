// Demo event bus.
//
// One-way firehose: anything in the backend calls `emit(...)`, every connected
// browser sees it. Deliberately dumb — no config, no async, safe to call from
// anywhere, and a no-op cost when nobody is watching.
//
// The UI is a pure reducer over this event log, so the ring buffer below is what
// makes a mid-demo browser refresh survivable: `since(0)` replays the whole run.

import type { DemoEvent, DemoEventType } from "./types.js";

export const BUFFER_LIMIT = 500;

type Listener = (event: DemoEvent) => void;

const listeners = new Set<Listener>();
const buffer: DemoEvent[] = [];
let seq = 0;

/**
 * Publish an event to every connected client and append it to the replay buffer.
 * Returns the stamped event (with `seq`/`ts`) so callers can log or correlate it.
 */
export function emit<T extends DemoEventType>(
  type: T,
  payload: Record<string, unknown> = {},
): DemoEvent {
  const event = { seq: ++seq, ts: Date.now(), type, ...payload } as DemoEvent;

  buffer.push(event);
  if (buffer.length > BUFFER_LIMIT) buffer.shift();

  // A slow/dead client must never take down the run that's being demoed.
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      listeners.delete(listener);
    }
  }

  return event;
}

/** Subscribe to future events. Returns an unsubscribe function. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Buffered events with `seq` greater than `after` — used to replay on reconnect. */
export function since(after: number): DemoEvent[] {
  return buffer.filter((e) => e.seq > after);
}

/** Everything still in the buffer. */
export function history(): DemoEvent[] {
  return [...buffer];
}

/**
 * Drop all buffered events. Between demo runs only.
 *
 * `seq` deliberately keeps counting. Zeroing it looks tidier but breaks the
 * demo: a browser that watched run #1 holds `Last-Event-ID: 37`, so when run #2
 * restarts at 1 the server replays nothing and the client — which dedupes by
 * seq — discards the new events as ones it has already seen. The canvas stays
 * blank until someone hard-refreshes, which is not a thing you want to discover
 * on stage. Monotonic forever is the only safe choice.
 */
export function reset(): void {
  buffer.length = 0;
}

export function subscriberCount(): number {
  return listeners.size;
}
