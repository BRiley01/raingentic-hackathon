import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import allRoutes from "./routes/all-routes.js";
import { config } from "../config/index.js";
import { paywallMiddleware, x402Enabled, x402Status } from "../payments/x402.js";

/**
 * Serve the built canvas from the same origin as the API.
 *
 * Deployed as ONE app on purpose. The UI fetches relative URLs (`/api/events`,
 * `/api/events/reset`), so same-origin means no CORS to configure and EventSource
 * just works. It also keeps `hire_agent`'s x402 self-call — which fetches
 * `http://127.0.0.1:$PORT/api/agents/…` to satisfy its own paywall — on the same
 * machine as the paywall it has to get past.
 *
 * A no-op when `web/dist` is absent: tests must not depend on a built canvas, and
 * in development Vite serves the UI on :5173 and proxies /api here.
 */
function serveCanvas(app: express.Express) {
  const dist = fileURLToPath(new URL("../../web/dist", import.meta.url));
  const shell = path.join(dist, "index.html");
  if (!fs.existsSync(shell)) return;

  app.use(express.static(dist));

  // SPA fallback. `app.get("*")` throws in Express 5 (path-to-regexp v8 rejects a
  // bare wildcard), so this filters inside a plain middleware instead. /api is
  // excluded explicitly — otherwise a mistyped endpoint would answer with the HTML
  // shell and a 200 instead of a 404, which is a miserable thing to debug on stage.
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api")) return next();
    res.sendFile(shell);
  });
}

export function createApp() {
  const app = express();
  app.use(express.json());

  // Paywall the seller routes when x402 is armed. Mounted on the APP, not inside the /api
  // router, because the middleware matches the URL as the client sent it. Unarmed (tests,
  // simulator) this is skipped entirely and the seller answers for free.
  if (x402Enabled()) app.use(paywallMiddleware());

  app.use("/api", allRoutes);
  serveCanvas(app);
  return app;
}

export function startServer() {
  const app = createApp();
  const port = config?.port ?? 3000;
  // No host argument on purpose. Node then binds dual-stack (`::` accepting IPv4
  // too), and fly-proxy reaches a machine over its private IPv6 address — pinning
  // this to "0.0.0.0" is IPv4-only and makes the app unreachable on Fly while
  // working perfectly on localhost.
  app.listen(port, () => {
    console.log(`API server listening on http://localhost:${port}`);
    console.log(`  x402: ${x402Status()}`);
  });
  return app;
}
