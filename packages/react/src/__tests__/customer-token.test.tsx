import { QueryClient } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BillingProvider,
  BillingRequestError,
  useCreditBalance,
  useCreditHistory,
  useEntitlement,
  useSubscription,
  useUpgradePreview,
  useUsage,
  type CustomerToken,
} from "../index.js";
import { customerTokenSource } from "../core/customer-token.js";

afterEach(() => vi.unstubAllGlobals());

const inOneHour = () => new Date(Date.now() + 3_600_000).toISOString();

interface Call {
  url: URL;
  authorization: string | null;
  token: string | null;
}

function stubNozle(answer: (url: URL, token: string | null) => Response | undefined = () => undefined) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = new URL(String(input));
      const headers = new Headers(init.headers);
      const token = headers.get("x-nozle-customer-token");
      calls.push({ url, authorization: headers.get("authorization"), token });
      const custom = answer(url, token);
      if (custom) return custom;
      switch (url.pathname) {
        case "/engine/api/v1/can":
          return Response.json({ allowed: true, used: 3, limit: 10, remaining: 7 });
        case "/engine/api/v1/customers/cus%201/credit-systems":
          return Response.json({ balances: [{ credit_system: "ai", available: "80" }] });
        case "/engine/api/v1/customers/cus%201/credit-operations":
          return Response.json({ operations: [{ id: "op1" }], next_cursor: null });
        case "/engine/api/v1/subscriptions/current":
          return Response.json({ plan: "pro", plan_name: "Pro", interval: "monthly", status: "active", amount_cents: 2900, currency: "USD" });
        case "/core/api/v1/subscriptions":
          return Response.json({
            subscriptions: [{ external_id: "sub_1", plan_code: "pro", status: "active", ending_at: null, plan_version: 2, next_plan_code: "basic", downgrade_plan_date: "2026-12-01" }],
          });
        case "/core/api/v1/customers/cus%201/current_usage":
          return Response.json({ customer_usage: { amount_cents: 5 } });
        case "/core/api/v1/customers/cus%201/past_usage":
          return Response.json({ usage_periods: [{ amount_cents: 1 }] });
      }
      return Response.json({ code: "not_found" }, { status: 404 });
    }),
  );
  return calls;
}

function wrapperWith(getCustomerToken: () => Promise<CustomerToken>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <BillingProvider
      publishableKey="pk_test"
      baseUrl="https://api.example/engine"
      getCustomerToken={getCustomerToken}
      queryClient={queryClient}
      savedAppearance={false}
    >
      {children}
    </BillingProvider>
  );
}

describe("customer token reads", () => {
  it("reads entitlements, credits and history from the Engine with the publishable key and the token", async () => {
    const calls = stubNozle();
    const getToken = vi.fn(async () => ({ token: "tok_1", customer_id: "cus 1", expires_at: inOneHour() }));
    const wrapper = wrapperWith(getToken);

    const entitlement = renderHook(() => useEntitlement("seats", { subscriptionId: "sub_1" }), { wrapper });
    const credits = renderHook(() => useCreditBalance(), { wrapper });
    const history = renderHook(() => useCreditHistory({ creditSystemCode: "ai", limit: 5 }), { wrapper });

    await waitFor(() => expect(entitlement.result.current.data).toEqual({ allowed: true, used: 3, limit: 10, remaining: 7 }));
    await waitFor(() => expect(credits.result.current.data).toEqual({ credit_system: "ai", available: "80" }));
    await waitFor(() => expect(history.result.current.operations).toEqual([{ id: "op1" }]));

    const can = calls.find((call) => call.url.pathname.endsWith("/can"))!;
    expect(Object.fromEntries(can.url.searchParams)).toEqual({ customer_id: "cus 1", feature: "seats", subscription_id: "sub_1" });
    const operations = calls.find((call) => call.url.pathname.endsWith("/credit-operations"))!;
    expect(Object.fromEntries(operations.url.searchParams)).toEqual({ credit_system_code: "ai", limit: "5" });
    expect(calls.every((call) => call.authorization === "Bearer pk_test" && call.token === "tok_1")).toBe(true);
  });

  it("reads usage and the subscription from Core, shaped like the billing handler's answers", async () => {
    const calls = stubNozle();
    const wrapper = wrapperWith(async () => ({ token: "tok_1", customer_id: "cus 1", expires_at: inOneHour() }));

    const current = renderHook(() => useUsage(), { wrapper });
    const past = renderHook(() => useUsage({ period: "past", periods: 3 }), { wrapper });
    const subscription = renderHook(() => useSubscription(), { wrapper });

    await waitFor(() => expect(current.result.current.data).toEqual({ amount_cents: 5 }));
    await waitFor(() => expect(past.result.current.data).toEqual([{ amount_cents: 1 }]));
    await waitFor(() =>
      expect(subscription.result.current.data).toEqual({
        subscription: {
          external_id: "sub_1", plan_code: "pro", status: "active", ending_at: null, plan_version: 2,
          plan: { code: "pro", name: "Pro", amount_cents: 2900, currency: "USD", interval: "monthly" },
        },
        pending_change: { plan_code: "basic", name: "basic", effective_at: "2026-12-01" },
      }),
    );

    const list = calls.find((call) => call.url.pathname === "/core/api/v1/subscriptions")!;
    expect(Object.fromEntries(list.url.searchParams)).toEqual({ external_customer_id: "cus 1", "status[]": "active" });
    const pastCall = calls.find((call) => call.url.pathname.endsWith("/past_usage"))!;
    expect(Object.fromEntries(pastCall.url.searchParams)).toEqual({ external_subscription_id: "sub_1", periods_count: "3" });
  });

  it("asks for a new token once when Nozle refuses an expired one", async () => {
    stubNozle((url, token) =>
      url.pathname.endsWith("/can") && token === "tok_old" ? Response.json({ code: "customer_token_expired" }, { status: 401 }) : undefined,
    );
    const tokens = ["tok_old", "tok_new"];
    const getToken = vi.fn(async () => ({ token: tokens.shift()!, customer_id: "cus 1", expires_at: inOneHour() }));

    const { result } = renderHook(() => useEntitlement("seats"), { wrapper: wrapperWith(getToken) });

    await waitFor(() => expect(result.current.data?.allowed).toBe(true));
    expect(getToken).toHaveBeenCalledTimes(2);
  });

  it("surfaces another refusal, and does not retry it", async () => {
    stubNozle((url) => (url.pathname.endsWith("/can") ? Response.json({ code: "customer_token_customer_mismatch" }, { status: 403 }) : undefined));
    const getToken = vi.fn(async () => ({ token: "tok_1", customer_id: "cus 1", expires_at: inOneHour() }));

    const { result } = renderHook(() => useEntitlement("seats"), { wrapper: wrapperWith(getToken) });

    await waitFor(() => expect(result.current.error).toBeInstanceOf(BillingRequestError));
    expect(result.current.error).toMatchObject({ status: 403, code: "customer_token_customer_mismatch" });
    expect(getToken).toHaveBeenCalledTimes(1);
  });

  it("leaves previews and invoices to billingEndpoint", async () => {
    stubNozle();
    const { result } = renderHook(() => useUpgradePreview("pro"), {
      wrapper: wrapperWith(async () => ({ token: "tok_1", customer_id: "cus 1", expires_at: inOneHour() })),
    });

    await waitFor(() => expect(result.current.error?.message).toContain("billingEndpoint"));
  });
});

describe("customerTokenSource", () => {
  it("reuses the token until a minute before it expires, with one request at a time", async () => {
    let now = Date.parse("2026-11-22T12:00:00Z");
    let n = 0;
    const get = vi.fn(async () => ({ token: `tok_${++n}`, customer_id: "cus", expires_at: "2026-11-22T13:00:00Z" }));
    const source = customerTokenSource(get, () => now);

    const [a, b] = await Promise.all([source.token(), source.token()]);
    expect([a.token, b.token]).toEqual(["tok_1", "tok_1"]);
    now = Date.parse("2026-11-22T12:58:59Z");
    expect((await source.token()).token).toBe("tok_1");
    now = Date.parse("2026-11-22T12:59:01Z");
    expect((await source.token()).token).toBe("tok_2");
    source.invalidate();
    expect((await source.token()).token).toBe("tok_3");
  });

  it("refreshes a short-lived token at half its lifetime", async () => {
    let now = Date.parse("2026-11-22T12:00:00Z");
    const get = vi.fn(async () => ({ token: "tok", customer_id: "cus", expires_at: "2026-11-22T12:01:00Z" }));
    const source = customerTokenSource(get, () => now);

    await source.token();
    now += 29_000;
    await source.token();
    expect(get).toHaveBeenCalledTimes(1);
    now += 2_000;
    await source.token();
    expect(get).toHaveBeenCalledTimes(2);
  });
});
