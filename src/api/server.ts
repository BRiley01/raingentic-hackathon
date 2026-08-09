import express from "express";
import allRoutes from "./routes/all-routes.js";
import { config } from "../config/index.js";

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", allRoutes);
  return app;
}

export function startServer() {
  const app = createApp();
  const port = config?.port ?? 3000;
  app.listen(port, () => console.log(`API server listening on http://localhost:${port}`));
  return app;
}
