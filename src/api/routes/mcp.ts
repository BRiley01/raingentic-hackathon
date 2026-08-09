// Mount the marketplace MCP server on Express at /mcp.
//
// Stateless: a fresh server + transport per request, `sessionIdGenerator: undefined`.
// There's no cross-request session state to keep — the run lives in run-state.ts, which
// is process-wide on purpose, so a client reconnecting mid-run picks up exactly where it
// was rather than losing the trip.
//
// rain-cli tries Streamable HTTP first and falls back to legacy SSE, so POST is the path
// that matters; GET and DELETE are answered explicitly rather than 404ing into a
// confusing client-side error.

import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMarketplaceMcpServer } from "../../mcp/server.js";

const router = express.Router();

router.post("/mcp", async (req: any, res: any) => {
  const server = createMarketplaceMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  res.on("close", () => {
    // Order matters: close the transport before the server, or the server tries to write
    // to a socket that's already gone.
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });

  try {
    await server.connect(transport);
    // Express has already parsed the body, so hand it over rather than letting the
    // transport try to read a consumed stream.
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: `MCP server error: ${String(err)}` },
        id: null,
      });
    }
  }
});

// Stateless mode has no stream to resume and no session to delete. Say so in JSON-RPC
// rather than returning HTML, so a client reports something meaningful.
const notAllowed = (_req: any, res: any) =>
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "This MCP endpoint is stateless — use POST." },
    id: null,
  });

router.get("/mcp", notAllowed);
router.delete("/mcp", notAllowed);

export default router;
