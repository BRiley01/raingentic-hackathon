import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The backend serves the SSE stream on :3000 (src/api/server.ts). Proxying /api
// through the dev server means the browser only ever talks to one origin, so
// there is no CORS to configure and EventSource "just works".
export default defineConfig({
  plugins: [react()],
  // The event contract lives in the backend (src/events/types.ts) and is the one
  // thing both sides must agree on, so the UI imports it rather than keeping a
  // copy that can drift. Type-only today — nothing crosses at runtime.
  resolve: {
    alias: { "@shared": fileURLToPath(new URL("../src", import.meta.url)) },
  },
  server: {
    port: 5173,
    fs: { allow: [fileURLToPath(new URL("..", import.meta.url))] },
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
