import { useMemo, useState } from "react";
import { Background, BackgroundVariant, Controls, ReactFlow, ReactFlowProvider } from "@xyflow/react";
import StatHeader from "./components/StatHeader";
import EventLog from "./components/EventLog";
import { nodeTypes } from "./components/nodes";
import { useEventStream } from "./useEventStream";
import { summarize } from "./state/summary";
import { buildGraph } from "./state/graph";

export default function App() {
  const { events, mode, status, ageMs } = useEventStream();
  const [showLog, setShowLog] = useState(true);

  // Both are pure folds over the log — recomputed whenever an event lands, never
  // mutated. Memoised on length because the array is append-only.
  const summary = useMemo(() => summarize(events), [events.length]);
  const graph = useMemo(() => buildGraph(events), [events.length]);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <StatHeader {...summary} mode={mode} status={status} ageMs={ageMs} />

      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
          <ReactFlowProvider>
            <ReactFlow
              nodes={graph.nodes}
              edges={graph.edges}
              nodeTypes={nodeTypes}
              // Fixed layout, not a force sim (spec §5). Panning and zoom stay on
              // so you can push into the payment beat on stage.
              nodesDraggable={false}
              nodesConnectable={false}
              nodesFocusable={false}
              edgesFocusable={false}
              panOnScroll
              minZoom={0.3}
              maxZoom={1.6}
              // Framed for the FINAL board, so nothing reflows as the columns
              // fill in. Verified against 1680×1000 by scripts/shoot.ts.
              defaultViewport={{ x: 60, y: 100, zoom: 0.85 }}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={28} size={1} color="#1f2a3d" />
              {/* The framing is fixed so the board doesn't reflow as agents
                  appear — but give yourself a fit/zoom escape hatch for whatever
                  projector you end up plugged into. */}
              <Controls position="bottom-left" showInteractive={false} />
            </ReactFlow>
          </ReactFlowProvider>

          <button
            onClick={() => setShowLog((v) => !v)}
            style={{
              position: "absolute",
              right: 12,
              bottom: 12,
              background: "var(--surface)",
              color: "var(--text-dim)",
              border: "1px solid var(--border-strong)",
              borderRadius: 6,
              padding: "5px 10px",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            {showLog ? "hide log" : "show log"}
          </button>
        </div>

        {showLog && <EventLog events={events} />}
      </div>
    </div>
  );
}
