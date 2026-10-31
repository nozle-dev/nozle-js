import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BudgetExceededError,
  Nozle,
  NozleApiError,
  RefusalReason,
  UsageLimitExceededError,
  type Budget,
  type UsageHoldCreateResult,
} from "../index";

const budget: Budget = {
  feature_code: "agent_execution",
  limit: "50",
  spent: "49.5",
  held: "0.5",
  remaining: "0",
  currency: "USD",
  period: "billing_period",
  period_start: "2026-10-01T00:00:00Z",
  period_end: "2026-11-01T00:00:00Z",
  mode: "hard",
  status: "exceeded",
  as_of: "2026-10-31T11:59:58.123Z",
};

const engine = "/engine/api/v1";
const nozle = () => new Nozle({ apiKey: "sk_test", host: "https://api.example", maxRetries: 0 });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, statusText: status === 200 ? "OK" : "Err", headers: { "content-type": "application/json" } });
function stub(response: () => Response) {
  const fetch = vi.fn(async (_input: RequestInfo | URL, _init: RequestInit = {}) => response());
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
const url = (fetch: ReturnType<typeof stub>) => new URL(String(fetch.mock.calls[0][0]));

afterEach(() => vi.unstubAllGlobals());

describe("budgets", () => {
  it("can() returns budget_exceeded with the budget block, not an error", async () => {
    stub(() => json({ allowed: false, reason: "budget_exceeded", used: 0, limit: null, remaining: null, budget }));
    const result = await nozle().can("acme", "agent_execution");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(RefusalReason.BudgetExceeded);
    expect(result.budget).toEqual(budget);
  });

  it("passes an unknown reason through as its string", async () => {
    stub(() => json({ allowed: false, reason: "some_new_reason", used: 0, limit: null, remaining: null }));
    expect((await nozle().can("acme", "f")).reason).toBe("some_new_reason");
  });

  it("usage.check and usage.track carry the budget refusal", async () => {
    stub(() => json({ allowed: false, reason: "budget_exceeded", budget }));
    const check = await nozle().usage.check({ customerId: "acme", featureCode: "agent_execution" });
    expect(check).toMatchObject({ allowed: false, reason: RefusalReason.BudgetExceeded, budget });
    const track = await nozle().usage.track({ customerId: "acme", featureCode: "agent_execution" }, { idempotencyKey: "k1" });
    expect(track.budget?.status).toBe("exceeded");
  });

  it("budgets.list reads GET /customers/{id}/budgets with subscription_id", async () => {
    const fetch = stub(() => json({ customer_id: "acme/1", subscription_id: "sub_1", budgets: [budget, { ...budget, feature_code: null }] }));
    const list = await nozle().budgets.list("acme/1", { subscriptionId: "sub_1" });
    expect(url(fetch).pathname).toBe(`${engine}/customers/acme%2F1/budgets`);
    expect(url(fetch).searchParams.get("subscription_id")).toBe("sub_1");
    expect(fetch.mock.calls[0][1]?.method ?? "GET").toBe("GET");
    expect(list.budgets[1].feature_code).toBeNull();
  });

  it("budgets.list omits subscription_id when not given and validates the customer", async () => {
    const fetch = stub(() => json({ customer_id: "acme", subscription_id: "sub_1", budgets: [] }));
    await nozle().budgets.list("acme");
    expect(url(fetch).search).toBe("");
    await expect(nozle().budgets.list(" ")).rejects.toThrow("budgets.list requires customerId");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("budgets.list errors are NozleApiError", async () => {
    stub(() => json({ code: "budget_unavailable", error: "budget lookup failed" }, 503));
    const error = await nozle().budgets.list("acme").catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(NozleApiError);
    expect((error as NozleApiError).code).toBe("budget_unavailable");
  });
});

describe("typed refusal errors", () => {
  it("a 402 budget_exceeded is a BudgetExceededError carrying the budget", async () => {
    stub(() => json({ error: { message: "the customer's hard spend limit is reached", code: "budget_exceeded" }, code: "budget_exceeded", budget }, 402));
    const error = await nozle().usage.track({ customerId: "acme", featureCode: "f" }, { idempotencyKey: "k" }).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(BudgetExceededError);
    expect(error).toBeInstanceOf(NozleApiError);
    expect((error as BudgetExceededError).status).toBe(402);
    expect((error as BudgetExceededError).budget).toEqual(budget);
  });

  it("a 402 budget_exceeded without a budget block has budget undefined", async () => {
    stub(() => json({ error: { code: "budget_exceeded" }, code: "budget_exceeded" }, 402));
    const error = (await nozle().budgets.list("acme").catch((cause: unknown) => cause)) as BudgetExceededError;
    expect(error).toBeInstanceOf(BudgetExceededError);
    expect(error.budget).toBeUndefined();
  });

  it("a 429 usage_limit_exceeded is a UsageLimitExceededError", async () => {
    stub(() => json({ code: "usage_limit_exceeded" }, 429));
    const error = await nozle().budgets.list("acme").catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(UsageLimitExceededError);
    expect((error as UsageLimitExceededError).code).toBe(RefusalReason.UsageLimitExceeded);
  });

  it("other codes on 402/429 stay a plain NozleApiError", async () => {
    for (const [status, code] of [[402, "insufficient_credits"], [429, "budget_exceeded"], [402, "usage_limit_exceeded"]] as const) {
      stub(() => json({ code }, status));
      const error = await nozle().budgets.list("acme").catch((cause: unknown) => cause);
      expect(error).toBeInstanceOf(NozleApiError);
      expect(error).not.toBeInstanceOf(BudgetExceededError);
      expect(error).not.toBeInstanceOf(UsageLimitExceededError);
    }
  });

  it("a 200 allowed:false from can() is never thrown", async () => {
    stub(() => json({ allowed: false, reason: "usage_limit_exceeded", used: 5, limit: 3, remaining: 0 }));
    expect((await nozle().can("acme", "f")).reason).toBe(RefusalReason.UsageLimitExceeded);
  });
});

describe("budget holds", () => {
  const budgetHold = {
    hold_id: "bh_1",
    kind: "budget",
    status: "held",
    customer_id: "acme",
    subscription_id: "sub_1",
    feature_code: "agent_execution",
    metric_amount: "1000",
    amount_held: "0.25",
    currency: "USD",
    expires_at: "2026-10-31T12:15:00Z",
    created_at: "2026-10-31T12:00:00Z",
    resolved_at: null,
  };

  it("create returns a budget hold narrowed by kind", async () => {
    stub(() => json({ ...budgetHold, allowed: true }));
    const result: UsageHoldCreateResult = await nozle().usage.holds.create(
      { customerId: "acme", featureCode: "agent_execution", properties: { tokens: 1000 } },
      { idempotencyKey: "run-1" },
    );
    if (result.kind !== "budget") throw new Error("expected a budget hold");
    expect(result.amount_held).toBe("0.25");
    expect(result.currency).toBe("USD");
  });

  it("a refused budget hold is allowed:false with budget_exceeded and the budget", async () => {
    stub(() => json({ ...budgetHold, status: "denied", amount_held: "0", allowed: false, reason: "budget_exceeded", budget }));
    const result = await nozle().usage.holds.create({ customerId: "acme", featureCode: "agent_execution" }, { idempotencyKey: "run-2" });
    expect(result).toMatchObject({ kind: "budget", allowed: false, reason: RefusalReason.BudgetExceeded, budget });
  });

  it("finalize, get and release return the budget hold", async () => {
    stub(() => json({ ...budgetHold, status: "finalized" }));
    const finalized = await nozle().usage.holds.finalize("bh_1", { properties: { tokens: 900 } });
    expect(finalized.kind).toBe("budget");
    const got = await nozle().usage.holds.get("bh_1");
    if (got.kind === "budget") expect(got.amount_held).toBe("0.25");
    else throw new Error("expected a budget hold");
  });

  it("a credit hold has no kind", async () => {
    stub(() => json({ hold_id: "h", status: "held", customer_id: "acme", feature_code: "f", credit_system: "ai", metric_amount: "1", credits_required: "2", credits_held: "2", expires_at: "x", created_at: "x", resolved_at: null }));
    const got = await nozle().usage.holds.get("h");
    if (got.kind === undefined) expect(got.credits_held).toBe("2");
    else throw new Error("expected a credit hold");
  });
});
