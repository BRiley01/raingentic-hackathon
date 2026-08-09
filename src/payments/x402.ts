// Real x402 payments on Monad testnet.
//
// The recipe here is lifted from ../raingentic, which had a working on-chain flow — its
// seller wallets still hold the USDC to prove it. Two details from there are load-bearing
// and cost real time to discover, so they are restated rather than referenced:
//
//  1. The EIP-712 domain is name="USDC", version="2" — NOT "USD Coin". Verified there
//     byte-for-byte against DOMAIN_SEPARATOR() on-chain. A wrong domain produces a
//     signature that verifies against nothing, with no useful error.
//  2. Price must be an AssetAmount `{ asset, amount, extra }`, not a "$0.001" string.
//     That sidesteps the MoneyParser chain entirely.
//
// Only the BUYER holds a key. The nine seller wallets are receive-only and have no keys
// at all, and the facilitator pays gas, so no wallet on either side needs MON.

import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPayment, x402Client, decodePaymentResponseHeader } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { ExactEvmScheme as ExactEvmServerScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { paymentMiddlewareFromConfig } from "@x402/express";
import type { RouteConfig, RoutesConfig } from "@x402/core/server";
import type { Network } from "@x402/core/types";
import { DEFAULT_AGENTS } from "../agent/agents.seed.js";

/** See the note above — do not "improve" this to "USD Coin". */
const EIP712_EXTRA = { name: "USDC", version: "2" };

// Read at CALL time, never at import time.
//
// ES imports are hoisted and evaluated before the importing module's body runs, so
// `loadEnv()` in src/index.ts happens AFTER this module is evaluated. Top-level
// `const USDC = process.env.USDC_ADDRESS` therefore always saw an empty value and x402
// silently reported itself as simulated while a perfectly good .env sat on disk.
const USDC = () => process.env.USDC_ADDRESS ?? "";
const FACILITATOR = () => process.env.X402_FACILITATOR_URL ?? "";
const BUYER_KEY = () => process.env.BUYER_PRIVATE_KEY ?? "";
const CHAIN_ID = () => process.env.MONAD_CHAIN_ID ?? "10143";
const EXPLORER = () => process.env.MONAD_EXPLORER_URL ?? "https://testnet.monadvision.com";

export const network = () => `eip155:${CHAIN_ID()}` as Network;

/**
 * Live only when everything needed is present.
 *
 * Absence is the normal case — tests and the simulator run without a key, and must keep
 * working. `src/index.ts` loads .env; nothing else does, so importing createApp in a test
 * never accidentally arms real payments.
 */
export function x402Enabled(): boolean {
  return Boolean(USDC() && FACILITATOR() && BUYER_KEY());
}

export function x402Status(): string {
  if (x402Enabled()) return `live — buyer ${buyerAddress()} on ${network()}`;
  const missing = [
    !USDC() && "USDC_ADDRESS",
    !FACILITATOR() && "X402_FACILITATOR_URL",
    !BUYER_KEY() && "BUYER_PRIVATE_KEY",
  ].filter(Boolean);
  return `simulated — missing ${missing.join(", ")}`;
}

/** USDC is 6 decimals, so $0.25 is 250000 atomic units. */
export function atomicUsdc(priceUsdc: number): string {
  return String(Math.round(priceUsdc * 1_000_000));
}

export const explorerTxUrl = (txHash: string) => `${EXPLORER()}/tx/${txHash}`;

let buyer: ReturnType<typeof privateKeyToAccount> | undefined;
function buyerAccount() {
  if (!buyer) buyer = privateKeyToAccount(BUYER_KEY() as `0x${string}`);
  return buyer;
}

export function buyerAddress(): string {
  return x402Enabled() ? buyerAccount().address : "";
}

let payFetch: typeof fetch | undefined;
/** fetch that answers a 402 by signing EIP-3009 and retrying. */
function paymentFetch(): typeof fetch {
  if (!payFetch) {
    payFetch = wrapFetchWithPayment(
      fetch,
      new x402Client().register(network(), new ExactEvmScheme(buyerAccount())),
    ) as typeof fetch;
  }
  return payFetch;
}

// ---- seller side -------------------------------------------------------------

/**
 * One paywalled route per agent, generated from the seed.
 *
 * `paymentMiddlewareFromConfig` takes a static map, and our price and payTo differ per
 * agent — so we enumerate the nine rather than trying to paywall a `:agentId` pattern.
 * Paths are absolute because the middleware is mounted on the app, not inside the /api
 * router, and it matches the URL as the client sent it.
 */
export function paywallRoutes(): RoutesConfig {
  // Build the record form explicitly — RoutesConfig is a union of "map of routes" and
  // "one route", so it has no index signature to assign through.
  const routes: Record<string, RouteConfig> = {};
  for (const agent of DEFAULT_AGENTS) {
    routes[`POST /api/agents/${agent.agentId}/query`] = {
      accepts: {
        scheme: "exact",
        network: network(),
        price: { asset: USDC(), amount: atomicUsdc(agent.priceUsdc), extra: EIP712_EXTRA },
        payTo: agent.wallet,
        maxTimeoutSeconds: 120,
      },
      description: `One recommendation from ${agent.name}`,
    } as RouteConfig;
  }
  return routes;
}

export function paywallMiddleware() {
  return paymentMiddlewareFromConfig(
    paywallRoutes(),
    new HTTPFacilitatorClient({ url: FACILITATOR() }),
    [{ network: network(), server: new ExactEvmServerScheme() }],
  );
}

// ---- buyer side --------------------------------------------------------------

export type PaidCall = {
  /** The 402 the seller issued, before paying — the challenge the audience should see. */
  challenge: { amountUsdc: number; payTo: string; network: string };
  txHash?: string;
  durationMs: number;
  body: any;
};

/**
 * Pay an agent and read its answer.
 *
 * Deliberately two requests. The first is unpaid: it collects the real 402 challenge so
 * `payment.challenge` carries what the seller actually demanded, rather than something we
 * assembled from the listing. `wrapFetchWithPayment` then does its own 402 round trip on
 * the paid call. One extra local request buys an honest challenge event.
 */
export async function payAndQuery(
  url: string,
  body: Record<string, unknown>,
  expectedUsdc: number,
): Promise<PaidCall> {
  const init = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };

  let challenge = { amountUsdc: expectedUsdc, payTo: "", network: String(network()) };
  try {
    const probe = await fetch(url, init);
    if (probe.status === 402) {
      // The challenge is in the PAYMENT-REQUIRED **header**, base64 JSON — the 402 body is
      // empty `{}`. Reading it from the body silently fell back to the listing price and
      // an empty payTo, so `payment.challenge` reported our own guess while looking like
      // it came from the seller. (v2 header names; the v1 X-PAYMENT names are dead.)
      const raw = probe.headers.get("payment-required") ?? probe.headers.get("x-payment-required");
      const offered = raw ? JSON.parse(Buffer.from(raw, "base64").toString("utf8")) : {};
      const accepts = offered?.accepts?.[0];
      if (accepts) {
        challenge = {
          // Atomic units back to USDC. The challenge — not the listing — is authoritative
          // on price (6.2), so this is the number that should reach the canvas.
          amountUsdc:
            Number(accepts.amount ?? accepts.maxAmountRequired ?? 0) / 1_000_000 || expectedUsdc,
          payTo: String(accepts.payTo ?? ""),
          network: String(accepts.network ?? network()),
        };
      }
    }
  } catch {
    // A failed probe is not fatal — the paid call below is what matters.
  }

  const started = Date.now();
  const response = await paymentFetch()(url, init);
  const durationMs = Date.now() - started;

  if (!response.ok) {
    throw new Error(`payment or query failed: ${response.status} ${await response.text()}`);
  }

  // The settlement result comes back on the response, so the tx hash is the SELLER's
  // report of what settled — not something the buyer inferred from its own signing.
  //
  // decodePaymentResponseHeader() rejects the header the Monad facilitator flow actually
  // produces ("Invalid payment response header") even though the header is present and
  // well-formed, so it's tried first and then decoded by hand. Verified against a real
  // settlement: `payment-response` is base64 JSON
  //   { success, payer, transaction, network }
  // and `transaction` is the tx hash. Without this the on-chain proof — the thing a judge
  // leans in for — silently never appears.
  let txHash: string | undefined;
  try {
    const settled = decodePaymentResponseHeader(response as any) as any;
    txHash = settled?.transaction ?? settled?.txHash ?? settled?.transactionHash;
  } catch {
    /* fall through to the manual decode */
  }
  if (!txHash) {
    const raw = response.headers.get("payment-response") ?? response.headers.get("x-payment-response");
    if (raw) {
      try {
        const settled = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
        if (settled?.success !== false) txHash = settled?.transaction;
      } catch {
        /* unreadable — leave txHash undefined rather than invent one */
      }
    }
  }

  return { challenge, txHash, durationMs, body: await response.json() };
}
