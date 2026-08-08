// Rain API types — matched to the Raingentic hackathon starter kit.
//
// Base URL: https://api-dev.raincards.xyz/v1   (sandbox only)
// Auth: `Api-Key` header on every request.
// Docs/playground: rain-sandbox-trial.mintlify.site
//
// The four credentials from the workshop desk:
//   apiKey     -> Api-Key header, authenticates every request
//   userId     -> the cardholder you issue to (path param on card issue)
//   teamId     -> scopes LIST endpoints (query param on GETs)
//   contractId -> the collateral you fund

// ---- Agent Control Layer policy (card scope) -------------------------------
export interface SpendPolicy {
  maxTransactionAmount?: number; // cents
  merchantAllowlist?: string[];
  categoryAllowlist?: string[];
  spendInterval?: "perTransaction" | "daily" | "weekly" | "monthly" | "allTime";
  expiry?: string; // ISO 8601
  counterpartyAllowlist?: string[];
}

// ---- Step 1: fund collateral ----------------------------------------------
// POST /simulate/collateral/fund  { contractId, currency: "rusd", amount } (cents)
export interface FundCollateralRequest {
  contractId: string;
  currency: string; // "rusd"
  amount: number;   // cents
}

// ---- Step 2: issue a scoped card ------------------------------------------
// POST /issuing/users/{userId}/cards/scoped  { amountInUSDCents }
// Requires a `sessionid` header. The returned `id` is your cardId.
export interface IssueScopedCardRequest {
  amountInUSDCents: number;
  // Optional scope fields (playground "full schemas"); safe to include.
  merchantName?: string;
  merchantCategoryCode?: string;
  policy?: SpendPolicy;
}

export interface RainCard {
  id: string;
  last4?: string;
  status?: string;
  amountInUSDCents?: number;
}

// ---- Step 3: authorize then settle ----------------------------------------
// POST /simulate/transactions/authorize
//   { cardId, amount, currency, merchantName, merchantCategoryCode }
// POST /simulate/transactions/{id}/settle
export interface AuthorizeRequest {
  cardId: string;
  amount: number;   // cents
  currency: string; // "usd"
  merchantName: string;
  merchantCategoryCode: string;
}

export interface RainTransaction {
  id: string;
  cardId?: string;
  amount?: number;
  currency?: string;
  status?: string; // "authorized" | "settled" | "declined" ...
  merchantName?: string;
}

// ---- Step 5: move money across rails --------------------------------------
// POST /payment-routes            { userId, source, destination }
// POST /simulate/payment-routes   { paymentRouteId, amount }
export interface PaymentRouteRequest {
  userId: string;
  source: string;
  destination: string;
}
export interface PaymentRoute {
  id: string;
}
export interface SimulatePaymentRouteRequest {
  paymentRouteId: string;
  amount: number; // cents
}

// ---- Our normalized charge result -----------------------------------------
export interface ChargeResult {
  cardId: string;
  vendor: string;
  amountCents: number;
  status: "settled" | "declined" | "skipped";
  reason?: string;
  transactionId?: string;
}
