import { loadEnv } from "./config/load-env.js";

// Before anything reads process.env — x402 decides live vs simulated at import time.
loadEnv();

import { startServer } from "./api/server.js";

startServer();
