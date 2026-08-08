// Rain client — Raingentic hackathon starter kit flow.
//
// One interface, two impls (live HTTP vs in-memory mock), chosen by RAIN_MODE.
//
// The real sandbox flow (from the starter kit):
//   1. POST /simulate/collateral/fund            fund the collateral contract
//   2. POST /issuing/users/{userId}/cards/scoped issue a scoped card (needs sessionid header)
//   3. POST /simulate/transactions/authorize     authorize a charge
//      POST /simulate/transactions/{id}/settle   then settle it
//   4. GET  /issuing/transactions?limit=20       read transactions back
//   5. POST /payment-routes + /simulate/payment-routes  move money across rails
//
// Auth: `Api-Key` header on every call. Card issue additionally needs `sessionid`.
// teamId scopes LIST endpoints (passed as a query param on GETs).

import type {
  FundCollateralRequest,
  IssueScopedCardRequest,
  RainCard,
  AuthorizeRequest,
  RainTransaction,
  PaymentRouteRequest,
  PaymentRoute,
  SimulatePaymentRouteRequest,
  ChargeResult,
} from "./types.js";

export interface RainClient {
  fundCollateral(req: FundCollateralRequest): Promise<void>;
  issueScopedCard(userId: string, req: IssueScopedCardRequest): Promise<RainCard>;
  authorize(req: AuthorizeRequest): Promise<RainTransaction>;
  settle(transactionId: string): Promise<RainTransaction>;
  listTransactions(limit?: number): Promise<RainTransaction[]>;
  // Convenience: authorize + settle, returning a normalized ChargeResult.
  charge(
    cardId: string,
    vendor: string,
    amountCents: number,
    merchantCategoryCode?: string,
  ): Promise<ChargeResult>;
  // Step 5 (optional for the travel demo).
  createPaymentRoute(req: PaymentRouteRequest): Promise<PaymentRoute>;
  simulatePaymentRoute(req: SimulatePaymentRouteRequest): Promise<void>;
}

export interface LiveRainConfig {
  baseUrl: string;
  apiKey: string;
  teamId?: string;
  sessionId?: string; // required for card issuance
}

// ---------------------------------------------------------------------------
// Live client
// ---------------------------------------------------------------------------
export class LiveRainClient implements RainClient {
  constructor(private readonly cfg: LiveRainConfig) {
    if (!cfg.baseUrl) throw new Error("RAIN_BASE_URL is required in live mode");
    if (!cfg.apiKey) throw new Error("RAIN_API_KEY is required in live mode");
  }

  private async req<T>(
    path: string,
    init?: RequestInit & { extraHeaders?: Record<string, string> },
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Api-Key": this.cfg.apiKey,
      ...(init?.extraHeaders ?? {}),
    };
    const res = await fetch(`${this.cfg.baseUrl}${path}`, { ...init, headers });
    if (!res.ok) {
      let detail = "";
      try { detail = JSON.stringify(await res.json()); }
      catch { detail = await res.text().catch(() => ""); }
      throw new Error(`Rain ${init?.method ?? "GET"} ${path} -> ${res.status}: ${detail}`);
    }
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  async fundCollateral(req: FundCollateralRequest): Promise<void> {
    await this.req<void>("/simulate/collateral/fund", {
      method: "POST",
      body: JSON.stringify(req),
    });
  }

  async issueScopedCard(userId: string, req: IssueScopedCardRequest): Promise<RainCard> {
    if (!this.cfg.sessionId) {
      throw new Error(
        "Card issuance requires a sessionid header — set RAIN_SESSION_ID (get it from the sandbox playground / workshop desk).",
      );
    }
    return this.req<RainCard>(`/issuing/users/${userId}/cards/scoped`, {
      method: "POST",
      body: JSON.stringify(req),
      extraHeaders: { sessionid: this.cfg.sessionId },
    });
  }

  async authorize(req: AuthorizeRequest): Promise<RainTransaction> {
    return this.req<RainTransaction>("/simulate/transactions/authorize", {
      method: "POST",
      body: JSON.stringify(req),
    });
  }

  async settle(transactionId: string): Promise<RainTransaction> {
    return this.req<RainTransaction>(`/simulate/transactions/${transactionId}/settle`, {
      method: "POST",
    });
  }

  async listTransactions(limit = 20): Promise<RainTransaction[]> {
    const team = this.cfg.teamId ? `&teamId=${encodeURIComponent(this.cfg.teamId)}` : "";
    const out = await this.req<any>(`/issuing/transactions?limit=${limit}${team}`);
    return Array.isArray(out) ? out : (out?.data ?? []);
  }

  async charge(
    cardId: string,
    vendor: string,
    amountCents: number,
    merchantCategoryCode = "7999",
  ): Promise<ChargeResult> {
    try {
      const auth = await this.authorize({
        cardId,
        amount: amountCents,
        currency: "usd",
        merchantName: vendor,
        merchantCategoryCode,
      });
      if (auth.status === "declined") {
        return { cardId, vendor, amountCents, status: "declined", reason: "authorization declined", transactionId: auth.id };
      }
      const settled = await this.settle(auth.id);
      return {
        cardId,
        vendor,
        amountCents,
        status: settled.status === "declined" ? "declined" : "settled",
        transactionId: settled.id,
      };
    } catch (e: any) {
      return { cardId, vendor, amountCents, status: "declined", reason: e.message };
    }
  }

  async createPaymentRoute(req: PaymentRouteRequest): Promise<PaymentRoute> {
    return this.req<PaymentRoute>("/payment-routes", {
      method: "POST",
      body: JSON.stringify(req),
    });
  }

  async simulatePaymentRoute(req: SimulatePaymentRouteRequest): Promise<void> {
    await this.req<void>("/simulate/payment-routes", {
      method: "POST",
      body: JSON.stringify(req),
    });
  }
}

// ---------------------------------------------------------------------------
// Mock client — mirrors the flow, enforces the scoped-card limit locally.
// ---------------------------------------------------------------------------
export class MockRainClient implements RainClient {
  private collateralCents = 0;
  private cards = new Map<string, { limitCents: number; spentCents: number }>();
  private txns: RainTransaction[] = [];
  private seq = 0;
  private nextId(p: string) { this.seq += 1; return `${p}_${this.seq.toString().padStart(4, "0")}`; }

  async fundCollateral(req: FundCollateralRequest): Promise<void> {
    this.collateralCents += req.amount;
  }

  async issueScopedCard(_userId: string, req: IssueScopedCardRequest): Promise<RainCard> {
    const id = this.nextId("card");
    this.cards.set(id, { limitCents: req.amountInUSDCents, spentCents: 0 });
    return { id, last4: (1000 + (this.seq % 9000)).toString(), status: "active", amountInUSDCents: req.amountInUSDCents };
  }

  async authorize(req: AuthorizeRequest): Promise<RainTransaction> {
    const card = this.cards.get(req.cardId);
    const id = this.nextId("txn");
    if (!card) {
      const t: RainTransaction = { id, cardId: req.cardId, amount: req.amount, currency: req.currency, status: "declined", merchantName: req.merchantName };
      this.txns.unshift(t); return t;
    }
    const wouldExceed = card.spentCents + req.amount > card.limitCents;
    const t: RainTransaction = {
      id, cardId: req.cardId, amount: req.amount, currency: req.currency,
      status: wouldExceed ? "declined" : "authorized", merchantName: req.merchantName,
    };
    this.txns.unshift(t);
    return t;
  }

  async settle(transactionId: string): Promise<RainTransaction> {
    const t = this.txns.find((x) => x.id === transactionId);
    if (!t) return { id: transactionId, status: "declined" };
    if (t.status === "declined") return t;
    const card = this.cards.get(t.cardId!);
    if (card) card.spentCents += t.amount ?? 0;
    t.status = "settled";
    return t;
  }

  async listTransactions(limit = 20): Promise<RainTransaction[]> {
    return this.txns.slice(0, limit);
  }

  async charge(cardId: string, vendor: string, amountCents: number, mcc = "7999"): Promise<ChargeResult> {
    const auth = await this.authorize({ cardId, amount: amountCents, currency: "usd", merchantName: vendor, merchantCategoryCode: mcc });
    if (auth.status === "declined") {
      const card = this.cards.get(cardId);
      const remaining = card ? card.limitCents - card.spentCents : 0;
      return { cardId, vendor, amountCents, status: "declined", transactionId: auth.id, reason: card ? `exceeds remaining card limit ${(remaining / 100).toFixed(2)}` : "unknown card" };
    }
    const settled = await this.settle(auth.id);
    return { cardId, vendor, amountCents, status: "settled", transactionId: settled.id };
  }

  async createPaymentRoute(_req: PaymentRouteRequest): Promise<PaymentRoute> {
    return { id: this.nextId("route") };
  }
  async simulatePaymentRoute(_req: SimulatePaymentRouteRequest): Promise<void> {}
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
export function makeRainClient(env: NodeJS.ProcessEnv = process.env): RainClient {
  const mode = (env.RAIN_MODE ?? "mock").toLowerCase();
  if (mode === "live") {
    return new LiveRainClient({
      baseUrl: env.RAIN_BASE_URL ?? "https://api-dev.raincards.xyz/v1",
      apiKey: env.RAIN_API_KEY ?? "",
      teamId: env.RAIN_TEAM_ID,
      sessionId: env.RAIN_SESSION_ID,
    });
  }
  return new MockRainClient();
}
