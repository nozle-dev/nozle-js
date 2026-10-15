import { describe, expect, it, vi } from "vitest";
import { createBillingHandler } from "../billing-handler";
import { NozleApiError } from "../errors";

function fakeNozle(subscriptions: Array<{ external_id: string }> = [{ external_id: "sub_1" }]) {
  return {
    getSubscriptions: vi.fn(async () => subscriptions),
    subscriptionOptions: vi.fn(async (_c: string, s: string) => ({ subscription: { external_id: s }, pending_change: null })),
    can: vi.fn(async () => ({ allowed: true, used: 1, limit: 10, remaining: 9 })),
    credits: {
      listBalances: vi.fn(async () => ({ balances: [] })),
      listOperations: vi.fn(async () => ({ operations: [], next_cursor: null })),
    },
    currentUsage: vi.fn(async () => ({ amount_cents: 5 })),
    pastUsage: vi.fn(async () => [{ amount_cents: 1 }]),
    previewSubscriptionChange: vi.fn(async () => ({ quote_id: "q1" })),
  };
}

const get = (path: string) => new Request(`https://app.example${path}`);

describe("createBillingHandler", () => {
  it("serves each route for the session customer only, ignoring any customer in the query", async () => {
    const nozle = fakeNozle();
    const handler = createBillingHandler(nozle as any, { getCustomerId: () => "cust_session" });

    expect(await (await handler(get("/api/nozle/subscription?customer_id=other"))).json()).toEqual({
      subscription: { external_id: "sub_1" },
      pending_change: null,
    });
    await handler(get("/api/nozle/entitlement?feature=ai_calls&customer_id=other"));
    expect(nozle.can).toHaveBeenCalledWith("cust_session", "ai_calls");
    await handler(get("/api/nozle/credit-history?cursor=c2&limit=5"));
    expect(nozle.credits.listOperations).toHaveBeenCalledWith("cust_session", { creditSystemCode: undefined, cursor: "c2", limit: 5 });
    expect(await (await handler(get("/api/nozle/usage"))).json()).toEqual({ usage: { amount_cents: 5 } });
    expect(await (await handler(get("/api/nozle/usage?period=past&periods=3"))).json()).toEqual({ periods: [{ amount_cents: 1 }] });
    expect(nozle.pastUsage).toHaveBeenCalledWith("cust_session", { subscriptionId: "sub_1", periods: 3 });
    await handler(get("/api/nozle/preview?plan=pro"));
    expect(nozle.previewSubscriptionChange).toHaveBeenCalledWith("cust_session", "sub_1", "pro");
  });

  it("answers 401 without a session, 404 for unknown routes, 405 for writes and 400 for missing input", async () => {
    const nozle = fakeNozle();
    const anonymous = createBillingHandler(nozle as any, { getCustomerId: async () => null });
    expect((await anonymous(get("/api/nozle/credits"))).status).toBe(401);

    const handler = createBillingHandler(nozle as any, { getCustomerId: () => "cust_1" });
    expect((await handler(get("/api/nozle/toString"))).status).toBe(404);
    expect((await handler(new Request("https://app.example/api/nozle/credits", { method: "POST" }))).status).toBe(405);
    const missing = await handler(get("/api/nozle/entitlement"));
    expect(missing.status).toBe(400);
    expect(await missing.json()).toMatchObject({ code: "invalid_request" });
  });

  it("returns empty data without a subscription and 409 with more than one", async () => {
    const none = createBillingHandler(fakeNozle([]) as any, { getCustomerId: () => "c" });
    expect(await (await none(get("/x/subscription"))).json()).toEqual({ subscription: null, pending_change: null });
    expect(await (await none(get("/x/usage"))).json()).toEqual({ usage: null, periods: [] });

    const two = createBillingHandler(fakeNozle([{ external_id: "a" }, { external_id: "b" }]) as any, { getCustomerId: () => "c" });
    expect((await two(get("/x/usage"))).status).toBe(409);
  });

  it("passes API client errors through and hides upstream failures", async () => {
    const nozle = fakeNozle();
    const notFound = new NozleApiError("can", { status: 404, statusText: "Not Found" }, { code: "customer_not_found" });
    nozle.can.mockRejectedValueOnce(notFound);
    const handler = createBillingHandler(nozle as any, { getCustomerId: () => "c" });
    const response = await handler(get("/x/entitlement?feature=f"));
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "customer_not_found" });

    nozle.credits.listBalances.mockRejectedValueOnce(new Error("secret internal detail"));
    const failed = await handler(get("/x/credits"));
    expect(failed.status).toBe(502);
    expect(await failed.text()).not.toContain("secret");
  });
});
