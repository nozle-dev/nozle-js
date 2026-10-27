import { afterEach, describe, expect, it, vi } from "vitest";
import { Nozle } from "../client";
import { NozleApiError } from "../errors";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
afterEach(() => fetchMock.mockReset());

const client = (apiKey = "sk_test") =>
  new Nozle({ apiKey, baseUrl: "https://api.example/engine", eventsUrl: "https://api.example/core" });

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "X-Request-Id": "req-1" } });
}

function sent(i = 0) {
  const [url, init] = fetchMock.mock.calls[i];
  const u = new URL(String(url));
  return {
    method: init?.method ?? "GET",
    path: u.pathname,
    query: Object.fromEntries(u.searchParams),
    headers: new Headers(init?.headers),
    body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
  };
}

async function rejection(promise: Promise<unknown>): Promise<NozleApiError> {
  const error = await promise.catch((e) => e);
  expect(error).toBeInstanceOf(NozleApiError);
  return error as NozleApiError;
}

const creditImport = {
  externalSubscriptionId: "merchant_subscription_123",
  creditSystemCode: "ai_credits",
  grantedAmount: "500",
  remainingAmount: "320",
};

const billingImport = {
  subscription: {
    planCode: "pro_monthly",
    status: "active" as const,
    billingAuthority: "external" as const,
    externalReference: "merchant_subscription_123",
    currentPeriodStart: "2026-10-15T00:00:00Z",
    currentPeriodEnd: "2026-11-15T00:00:00Z",
  },
};

describe("customers.importCreditBalance", () => {
  it("posts the opening balance to the Engine with the Idempotency-Key and unwraps the result", async () => {
    const result = { external_customer_id: "workspace 1", credit_system_code: "ai_credits", dry_run: true, replayed: false };
    fetchMock.mockResolvedValueOnce(json({ credit_balance_import: result }));
    await expect(
      client().customers.importCreditBalance("workspace 1", { ...creditImport, externalEntityId: "user_42", dryRun: true }, { idempotencyKey: "imp-1" }),
    ).resolves.toEqual(result);
    const req = sent();
    expect(req.method).toBe("POST");
    expect(req.path).toBe("/engine/api/v1/customers/workspace%201/credit-balance-imports");
    expect(req.headers.get("Idempotency-Key")).toBe("imp-1");
    expect(req.headers.get("Authorization")).toBe("Bearer sk_test");
    expect(req.body).toEqual({
      external_subscription_id: "merchant_subscription_123",
      credit_system_code: "ai_credits",
      granted_amount: "500",
      remaining_amount: "320",
      external_entity_id: "user_42",
      dry_run: true,
    });
  });

  it("leaves optional fields out of the body", async () => {
    fetchMock.mockResolvedValueOnce(json({ credit_balance_import: {} }, 201));
    await client().customers.importCreditBalance("c", creditImport, { idempotencyKey: "imp-2" });
    expect(Object.keys(sent().body)).toEqual(["external_subscription_id", "credit_system_code", "granted_amount", "remaining_amount"]);
  });

  it("maps an API error to NozleApiError", async () => {
    fetchMock.mockResolvedValueOnce(json({ code: "idempotency_key_reused", error: "Idempotency-Key was used with a different request" }, 409));
    const error = await rejection(client().customers.importCreditBalance("c", creditImport, { idempotencyKey: "imp-3" }));
    expect(error.status).toBe(409);
    expect(error.code).toBe("idempotency_key_reused");
    expect(error.requestId).toBe("req-1");
  });

  it("requires a secret key, a customer and an Idempotency-Key up to 255 bytes before sending", async () => {
    const opts = { idempotencyKey: "k" };
    await expect(client("pk_test").customers.importCreditBalance("c", creditImport, opts)).rejects.toThrow("secret key");
    await expect(client().customers.importCreditBalance(" ", creditImport, opts)).rejects.toThrow("customerId");
    for (const idempotencyKey of ["", " ", "é".repeat(128)])
      await expect(client().customers.importCreditBalance("c", creditImport, { idempotencyKey })).rejects.toThrow("idempotencyKey");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("customers.importBillingState", () => {
  it("posts the wrapped billing state to Core with the Idempotency-Key and unwraps the result", async () => {
    const result = { status: "validated", dry_run: true, external_customer_id: "c/1", subscription: {}, replayed: false };
    fetchMock.mockResolvedValueOnce(json({ billing_state_import: result }));
    await expect(
      client().customers.importBillingState("c/1", { ...billingImport, externalEntityId: "user_42", dryRun: true }, { idempotencyKey: "bs-1" }),
    ).resolves.toEqual(result);
    const req = sent();
    expect(req.method).toBe("POST");
    expect(req.path).toBe("/core/api/v1/customers/c%2F1/billing-state-imports");
    expect(req.headers.get("Idempotency-Key")).toBe("bs-1");
    expect(req.body).toEqual({
      billing_state_import: {
        dry_run: true,
        external_entity_id: "user_42",
        subscription: {
          plan_code: "pro_monthly",
          status: "active",
          billing_authority: "external",
          external_reference: "merchant_subscription_123",
          current_period_start: "2026-10-15T00:00:00Z",
          current_period_end: "2026-11-15T00:00:00Z",
        },
      },
    });
  });

  it("maps a validation error to NozleApiError with its details", async () => {
    fetchMock.mockResolvedValueOnce(
      json({ status: 422, error: "Unprocessable Entity", code: "validation_errors", error_details: { current_period: ["must_contain_current_time"] } }, 422),
    );
    const error = await rejection(client().customers.importBillingState("c", billingImport, { idempotencyKey: "bs-2" }));
    expect(error.status).toBe(422);
    expect(error.hasCode("must_contain_current_time")).toBe(true);
  });

  it("requires a secret key and an Idempotency-Key before sending", async () => {
    await expect(client("pk_test").customers.importBillingState("c", billingImport, { idempotencyKey: "k" })).rejects.toThrow("secret key");
    await expect(
      client().customers.importBillingState("c", billingImport, {} as { idempotencyKey: string }),
    ).rejects.toThrow("idempotencyKey");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("margin.forecast and margin.simulate", () => {
  it("forecast reads /margin/forecast with the range", async () => {
    fetchMock.mockResolvedValueOnce(json({ points: [], confidence: "low" }));
    await expect(client().margin.forecast({ from: "2026-10-01", to: "2026-10-15" })).resolves.toEqual({ points: [], confidence: "low" });
    expect(sent()).toMatchObject({ method: "GET", path: "/engine/api/v1/margin/forecast", query: { from: "2026-10-01", to: "2026-10-15" } });
  });

  it("simulate posts the metric and price with the range in the query", async () => {
    const result = { metric_code: "agent_execution", new_revenue_cents: 29500, event_count: 295 };
    fetchMock.mockResolvedValueOnce(json(result));
    await expect(
      client().margin.simulate({ metricCode: "agent_execution", newPriceDollars: 1 }, { from: "2026-07-01" }),
    ).resolves.toEqual(result);
    const req = sent();
    expect(req).toMatchObject({ method: "POST", path: "/engine/api/v1/margin/simulate", query: { from: "2026-07-01" } });
    expect(req.body).toEqual({ metric_code: "agent_execution", new_price_dollars: 1 });
  });

  it("maps errors to NozleApiError and validates the body locally", async () => {
    fetchMock.mockResolvedValueOnce(json({ code: "invalid_date_range", error: "to must be after from" }, 400));
    const error = await rejection(client().margin.forecast({ from: "2026-10-02", to: "2026-10-01" }));
    expect([error.status, error.code]).toEqual([400, "invalid_date_range"]);
    fetchMock.mockResolvedValueOnce(json({ code: "analytics_unavailable", error: "down" }, 503));
    expect((await rejection(client().margin.simulate({ metricCode: "m", newPriceDollars: 0 }))).code).toBe("analytics_unavailable");
    fetchMock.mockReset();
    await expect(client().margin.simulate({ metricCode: " ", newPriceDollars: 1 })).rejects.toThrow("metricCode");
    await expect(client().margin.simulate({ metricCode: "m", newPriceDollars: -1 })).rejects.toThrow("newPriceDollars");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("costIntelligence", () => {
  it("report reads /cost-intelligence/report with from, to and limit", async () => {
    fetchMock.mockResolvedValueOnce(json({ summary: { total_cost: "0" } }));
    await client().costIntelligence.report({ from: "2026-10-01T00:00:00Z", to: "2026-10-27T00:00:00Z", limit: 50 });
    expect(sent()).toMatchObject({
      method: "GET",
      path: "/engine/api/v1/cost-intelligence/report",
      query: { from: "2026-10-01T00:00:00Z", to: "2026-10-27T00:00:00Z", limit: "50" },
    });
    fetchMock.mockResolvedValueOnce(json({}));
    await client().costIntelligence.report();
    expect(sent(1).query).toEqual({});
  });

  it("previews and allocates a shared cost pool period", async () => {
    fetchMock.mockResolvedValueOnce(json({ allocations: [] })).mockResolvedValueOnce(json({ status: "completed" }));
    const nozle = client();
    await nozle.costIntelligence.previewSharedCostAllocation("pool/1", { allocationPeriodStart: "2026-10-01T00:00:00Z" });
    await expect(nozle.costIntelligence.allocateSharedCost("pool/1", { allocationPeriodStart: "2026-10-01T00:00:00Z" })).resolves.toEqual({
      status: "completed",
    });
    expect([sent(0).method, sent(0).path, sent(1).path]).toEqual([
      "POST",
      "/engine/api/v1/cost-intelligence/shared-costs/pool%2F1/preview",
      "/engine/api/v1/cost-intelligence/shared-costs/pool%2F1/allocate",
    ]);
    expect(sent(1).body).toEqual({ allocation_period_start: "2026-10-01T00:00:00Z" });
  });

  it("maps errors to NozleApiError and needs a secret key", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: "allocation period is still open" }, 409));
    expect((await rejection(client().costIntelligence.allocateSharedCost("p", { allocationPeriodStart: "2026-10-01T00:00:00Z" }))).status).toBe(409);
    fetchMock.mockReset();
    await expect(client("pk_test").costIntelligence.report()).rejects.toThrow("secret key");
    await expect(client().costIntelligence.previewSharedCostAllocation("p", { allocationPeriodStart: "" })).rejects.toThrow("allocationPeriodStart");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
