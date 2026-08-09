// Monad testnet block explorer links.
//
// One place, because two things build these: the mock stamps `explorerUrl` onto
// payment.settled (mirroring what the backend will emit), and the canvas links
// each agent card to its wallet.
//
// NOTE for mock runs: the seeded wallets are fabricated, so these pages will load
// and show an address with no history. That is the honest cost of clickable
// wallets before the real ones exist — in `?live=1` against the real backend the
// addresses are the funded testnet wallets and the transfers are really there.

// testnet.monadexplorer.com now answers with a permanent 308 to monadvision.com,
// so point at the canonical host directly rather than paying a redirect hop on
// stage. (Direct curl returns 403 — bot protection — but browsers load it fine.)
const BASE = "https://testnet.monadvision.com";

/** An account page — balance and transaction history for a seller agent's wallet. */
export function addressUrl(wallet: string): string {
  return `${BASE}/address/${wallet}`;
}

/** A single settlement. */
export function txUrl(txHash: string): string {
  return `${BASE}/tx/${txHash}`;
}
