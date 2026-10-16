import { QueryClient } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BillingProvider,
  BillingRequestError,
  useBillingRefresh,
  useCreditBalance,
  useCreditHistory,
  useEntitlement,
  useSubscription,
  useUpgradePreview,
  useUsage,
  useInvoices,
  useInvoiceDownload,
} from "../index.js";

const responses: Record<string, unknown> = {
  subscription: { subscription: { external_id: "sub_1", plan_code: "pro" }, pending_change: null },
  entitlement: { allowed: true, used: 3, limit: 10, remaining: 7 },
  credits: {
    balances: [
      { credit_system: "empty", credit_system_name: "Empty", unit_name: "credits", available: "0", as_of: "t" },
      { credit_system: "ai", credit_system_name: "AI", unit_name: "credits", available: "80", as_of: "t" },
    ],
  },
  usage: { usage: { amount_cents: 5 }, periods: [{ amount_cents: 1 }], projected: { amount_cents: 5, projected_amount_cents: 12 } },
  preview: { quote_id: "q1" },
  invoices: { invoices: [{ nozle_id: "inv_1", number: "INV-1" }], meta: { current_page: 2 } },
  "invoice-download": { url: "https://files.example/inv_1.pdf" },
};

function stubFetch() {
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "https://app.example");
    const route = url.pathname.split("/").pop() as string;
    if (route === "credit-history") {
      const cursor = url.searchParams.get("cursor");
      return Response.json(
        cursor
          ? { operations: [{ id: "op2" }], next_cursor: null }
          : { operations: [{ id: "op1" }], next_cursor: "c2" },
      );
    }
    if (route === "entitlement" && url.searchParams.get("feature") === "missing") {
      return Response.json({ code: "feature_not_found" }, { status: 404 });
    }
    return Response.json(responses[route]);
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function wrapper(props: { queryClient?: QueryClient; headers?: () => HeadersInit } = {}) {
  return ({ children }: { children: React.ReactNode }) => (
    <BillingProvider
      publishableKey="pk_test"
      billingEndpoint="/api/nozle/"
      billingHeaders={props.headers}
      queryClient={props.queryClient}
    >
      {children}
    </BillingProvider>
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("billing hooks", () => {
  it("read each route of the billing endpoint with the app's headers", async () => {
    const fetch = stubFetch();
    const { result } = renderHook(
      () => ({ subscription: useSubscription(), entitlement: useEntitlement("ai_calls") }),
      { wrapper: wrapper({ headers: () => ({ "X-CSRF-Token": "t1" }) }) },
    );
    await waitFor(() => expect(result.current.entitlement.data).toBeDefined());
    expect(result.current.subscription.data?.subscription?.plan_code).toBe("pro");
    expect(result.current.entitlement.data?.remaining).toBe(7);
    const [url, init] = fetch.mock.calls.find(([u]) => String(u).includes("entitlement")) as [string, RequestInit];
    expect(url).toBe("/api/nozle/entitlement?feature=ai_calls");
    expect(init.credentials).toBe("same-origin");
    expect((init.headers as Record<string, string>)["X-CSRF-Token"]).toBe("t1");
  });

  it("picks a credit balance and pages credit history", async () => {
    stubFetch();
    const { result } = renderHook(
      () => ({ any: useCreditBalance(), empty: useCreditBalance("empty"), history: useCreditHistory() }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.history.operations).toHaveLength(1));
    expect(result.current.any.data?.credit_system_name).toBe("AI");
    expect(result.current.empty.data?.credit_system_name).toBe("Empty");
    expect(result.current.history.hasNextPage).toBe(true);
    await act(() => result.current.history.fetchNextPage());
    await waitFor(() => expect(result.current.history.operations.map((op) => op.id)).toEqual(["op1", "op2"]));
    expect(result.current.history.hasNextPage).toBe(false);
  });

  it("returns current or past usage and waits for a plan before previewing", async () => {
    const fetch = stubFetch();
    const { result, rerender } = renderHook(
      ({ plan }: { plan?: string }) => ({
        current: useUsage(),
        past: useUsage({ period: "past", periods: 3 }),
        projected: useUsage({ period: "projected" }),
        preview: useUpgradePreview(plan),
      }),
      { wrapper: wrapper(), initialProps: {} as { plan?: string } },
    );
    await waitFor(() => expect(result.current.past.data).toBeDefined());
    expect(result.current.current.data).toEqual({ amount_cents: 5 });
    expect(result.current.past.data).toEqual([{ amount_cents: 1 }]);
    await waitFor(() => expect(result.current.projected.data).toEqual({ amount_cents: 5, projected_amount_cents: 12 }));
    expect(fetch.mock.calls.some(([u]) => String(u).includes("preview"))).toBe(false);
    rerender({ plan: "max" });
    await waitFor(() => expect(result.current.preview.data?.quote_id).toBe("q1"));
    expect(fetch.mock.calls.some(([u]) => String(u) === "/api/nozle/preview?plan=max")).toBe(true);
  });

  it("surfaces a 4xx as BillingRequestError without retrying", async () => {
    const fetch = stubFetch();
    const { result } = renderHook(() => useEntitlement("missing"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(BillingRequestError);
    expect((result.current.error as BillingRequestError).code).toBe("feature_not_found");
    expect(fetch.mock.calls.filter(([u]) => String(u).includes("missing"))).toHaveLength(1);
  });

  it("uses the app's query client when given and refreshes every billing query", async () => {
    const fetch = stubFetch();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => ({ subscription: useSubscription(), refresh: useBillingRefresh() }), {
      wrapper: wrapper({ queryClient }),
    });
    await waitFor(() => expect(result.current.subscription.data).toBeDefined());
    expect(queryClient.getQueryData(["nozle", "/api/nozle/", "subscription"])).toBeDefined();
    const before = fetch.mock.calls.length;
    await act(() => result.current.refresh());
    expect(fetch.mock.calls.length).toBeGreaterThan(before);
  });

  it("explains the missing billingEndpoint", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() =>
      renderHook(() => useSubscription(), {
        wrapper: ({ children }) => <BillingProvider publishableKey="pk_test">{children}</BillingProvider>,
      }),
    ).toThrow(/billingEndpoint/);
    quiet.mockRestore();
  });

  it("reads a page of invoices and resolves an invoice's PDF URL", async () => {
    const fetch = stubFetch();
    const { result } = renderHook(() => ({ invoices: useInvoices({ page: 2 }), download: useInvoiceDownload() }), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.invoices.data?.invoices[0].number).toBe("INV-1"));
    expect(fetch.mock.calls.some(([u]) => String(u) === "/api/nozle/invoices?page=2")).toBe(true);
    await expect(result.current.download("inv_1")).resolves.toBe("https://files.example/inv_1.pdf");
    expect(fetch.mock.calls.some(([u]) => String(u) === "/api/nozle/invoice-download?id=inv_1")).toBe(true);
  });
});
