import express from "express";
import allRoutes from "./routes/all-routes.js";
import { config } from "../config/index.js";
import { paywallMiddleware, x402Enabled, x402Status } from "../payments/x402.js";

export function createApp() {
  const app = express();
  app.use(express.json());

  // Paywall the seller routes when x402 is armed. Mounted on the APP, not inside the /api
  // router, because the middleware matches the URL as the client sent it. Unarmed (tests,
  // simulator) this is skipped entirely and the seller answers for free.
  if (x402Enabled()) app.use(paywallMiddleware());

  app.use("/api", allRoutes);
  return app;
}

export function startServer() {
  const app = createApp();
  const port = config?.port ?? 3000;
  app.listen(port, () => {
    console.log(`API server listening on http://localhost:${port}`);
    console.log(`  x402: ${x402Status()}`);
  });
  return app;
}
