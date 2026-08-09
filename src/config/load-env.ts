// Load .env — from the server entrypoint ONLY.
//
// Deliberately not called by createApp(): tests import createApp directly, and if that
// pulled in .env then importing an app in a unit test would arm real on-chain payments
// with a real key. The entrypoint arms them; nothing else does.

export function loadEnv(): void {
  try {
    // Node 20.12+/22+. Absent or malformed .env is fine — x402 then reports itself as
    // simulated rather than failing to boot.
    (process as unknown as { loadEnvFile: (p?: string) => void }).loadEnvFile();
  } catch {
    /* no .env, or an older runtime — carry on unarmed */
  }
}
