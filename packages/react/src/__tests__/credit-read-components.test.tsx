import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ProductCreditBalance } from "../components/billing/ProductCreditBalance";
import { CreditBreakdown } from "../components/billing/CreditBreakdown";
import { CreditUsageHistory } from "../components/billing/CreditUsageHistory";
import { EntityCreditBreakdown } from "../components/billing/EntityCreditBreakdown";
import { EntityCreditUsageHistory } from "../components/billing/EntityCreditUsageHistory";
import { EntityProductCreditBalance } from "../components/billing/EntityProductCreditBalance";
import { LowCreditWarning } from "../components/billing/LowCreditWarning";
import { BillingProvider } from "../provider";

const customerSessionToken = "csess_customer_123";
const baseUrl = "https://api.example.test";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status >= 200 && status < 300 ? "OK" : "Error",
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function provider(children: React.ReactNode) {
  return (
    <BillingProvider
      customerSessionToken={customerSessionToken}
      publishableKey="pk_browser"
      customerId="acme/west"
      baseUrl={baseUrl}
    >
      {children}
    </BillingProvider>
  );
}

function balanceResponse() {
  return {
    customer_id: "acme/west",
    credit_system: "ai credits",
    credit_system_id: "system-1",
    credit_system_name: "AI Credits",
    unit_name: "credit",
    system_status: "active",
    available: "123456789012345678.123456789012",
    as_of: "2026-07-20T12:00:00.750Z",
    sources: [
      {
        id: "source-1",
        type: "subscription_grant",
        reference: "subscription:period-1",
        subscription_id: "subscription-1",
        initial: "500.000000000001",
        remaining: "375.000000000001",
        valid_from: "2026-07-01T00:00:00Z",
        expires_at: "2026-08-01T00:00:00Z",
        priority: 100,
        status: "active",
        available: true,
      },
    ],
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("customer-session credit components", () => {
  it("renders exact decimal balances and source provenance with the scoped token", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input, init) => {
        const url = String(input);
        expect(init?.headers).toEqual(
          expect.objectContaining({
            Authorization: `Bearer ${customerSessionToken}`,
          }),
        );
        expect(url).toBe(
          `${baseUrl}/api/v1/customers/acme%2Fwest/credit-systems/ai%20credits/balance`,
        );
        return jsonResponse(balanceResponse());
      });

    render(
      provider(
        <>
          <ProductCreditBalance creditSystemCode="ai credits" />
          <CreditBreakdown creditSystemCode="ai credits" />
        </>,
      ),
    );

    expect(
      await screen.findByText("123,456,789,012,345,678.123456789012"),
    ).toBeTruthy();
    expect(await screen.findByText("Plan grant")).toBeTruthy();
    expect(screen.getByText("375.000000000001")).toBeTruthy();
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).includes("/credit-systems/"),
      ).length,
    ).toBe(2);
  });

  it("compares low-balance thresholds without floating-point coercion", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return jsonResponse({
        ...balanceResponse(),
        available: "0.000000000001",
      });
    });

    render(
      provider(
        <LowCreditWarning
          creditSystemCode="ai credits"
          threshold="0.000000000002"
        />,
      ),
    );

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Low balance: 0.000000000001 credits remaining.",
    );
  });

  it("guards concurrent pagination and deduplicates replayed operation rows", async () => {
    let resolveNextPage: ((response: Response) => void) | undefined;
    const nextPage = new Promise<Response>((resolve) => {
      resolveNextPage = resolve;
    });
    const operationOne = {
      id: "operation-1",
      credit_system: "ai_credits",
      credit_system_id: "system-1",
      credit_system_name: "AI Credits",
      unit_name: "credit",
      billable_metric_code: "agent_execution",
      type: "consume",
      status: "succeeded",
      metric_amount: "1",
      credit_amount: "2.000000000001",
      rate_id: "rate-1",
      rate_metric_amount: "1",
      rate_credit_amount: "2.000000000001",
      reason: null,
      occurred_at: "2026-07-20T12:00:00.750Z",
      source_allocations: [],
    };
    const operationTwo = {
      ...operationOne,
      id: "operation-2",
      type: "grant",
      billable_metric_code: null,
      metric_amount: null,
      credit_amount: "500",
      occurred_at: "2026-07-01T00:00:00Z",
    };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("cursor=next-page")) return nextPage;
        return jsonResponse({
          customer_id: "acme/west",
          operations: [operationOne],
          next_cursor: "next-page",
        });
      });

    render(
      provider(
        <CreditUsageHistory creditSystemCode="ai_credits" pageSize={1} />,
      ),
    );
    expect(await screen.findByText("Used for agent_execution")).toBeTruthy();
    const loadMore = screen.getByRole("button", { name: "Load more" });
    fireEvent.click(loadMore);
    fireEvent.click(loadMore);

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(([url]) =>
          String(url).includes("/credit-operations"),
        ),
      ).toHaveLength(2);
    });
    resolveNextPage?.(
      jsonResponse({
        customer_id: "acme/west",
        operations: [operationOne, operationTwo],
        next_cursor: null,
      }),
    );

    expect(await screen.findByText("Credits granted")).toBeTruthy();
    expect(screen.getAllByText("Used for agent_execution")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("renders Entity, shared, and effective balances with transfer provenance", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input, init) => {
        const url = String(input);
        expect(init?.headers).toEqual(
          expect.objectContaining({
            Authorization: `Bearer ${customerSessionToken}`,
          }),
        );
        expect(url).toBe(
          `${baseUrl}/api/v1/customers/acme%2Fwest/entities/user%2F42/credit-systems/ai%20credits/balance`,
        );
        return jsonResponse({
          ...balanceResponse(),
          entity_id: "user/42",
          entity_status: "active",
          entity_available: "480.000000000001",
          shared_available: "250",
          effective_available: "730.000000000001",
          pool_policy: "entity_then_customer",
          sources: [
            {
              ...balanceResponse().sources[0],
              entity_id: "user/42",
              scope: "entity",
              remaining: "380.000000000001",
            },
            {
              ...balanceResponse().sources[0],
              id: "allocated-source-1",
              type: "allocated_top_up",
              reference: "entity-allocation:operation-1:parent:source-top-up-1",
              parent_source_id: "source-top-up-1",
              scope: "entity",
              remaining: "100",
            },
            {
              ...balanceResponse().sources[0],
              id: "source-top-up-1",
              type: "top_up",
              reference: "top-up:purchase-1",
              entity_id: null,
              scope: "customer",
              transferable: true,
              remaining: "250",
            },
          ],
        });
      });

    render(
      provider(
        <>
          <EntityProductCreditBalance
            entityId="user/42"
            creditSystemCode="ai credits"
          />
          <EntityCreditBreakdown
            entityId="user/42"
            creditSystemCode="ai credits"
          />
        </>,
      ),
    );

    expect(await screen.findByText("730.000000000001")).toBeTruthy();
    expect(screen.getByText("Entity 480.000000000001")).toBeTruthy();
    expect(screen.getByText("Shared 250")).toBeTruthy();
    expect(screen.getByText("entity then customer")).toBeTruthy();
    expect(await screen.findByText("Allocated top-up")).toBeTruthy();
    expect(screen.getByText(/parent source-top-up-1/)).toBeTruthy();
    expect(screen.getByText(/Shared company pool/)).toBeTruthy();
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).includes("/entities/user%2F42/credit-systems/"),
      ),
    ).toHaveLength(2);
  });

  it("uses the Entity-scoped history endpoint and guards concurrent pagination", async () => {
    let resolveNextPage: ((response: Response) => void) | undefined;
    const nextPage = new Promise<Response>((resolve) => {
      resolveNextPage = resolve;
    });
    const operation = {
      id: "operation-entity-1",
      entity_id: "user/42",
      credit_system: "ai_credits",
      credit_system_id: "system-1",
      credit_system_name: "AI Credits",
      unit_name: "credit",
      billable_metric_code: "agent_execution",
      type: "consume",
      status: "succeeded",
      metric_amount: "1",
      credit_amount: "2",
      rate_id: "rate-1",
      rate_metric_amount: "1",
      rate_credit_amount: "2",
      reason: null,
      occurred_at: "2026-07-20T12:00:00.750Z",
      source_allocations: [],
    };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("cursor=next-entity-page")) return nextPage;
        expect(url).toContain(
          "/api/v1/customers/acme%2Fwest/entities/user%2F42/credit-operations?",
        );
        return jsonResponse({
          customer_id: "acme/west",
          entity_id: "user/42",
          operations: [operation],
          next_cursor: "next-entity-page",
        });
      });

    render(
      provider(
        <EntityCreditUsageHistory
          entityId="user/42"
          creditSystemCode="ai_credits"
          pageSize={1}
        />,
      ),
    );
    expect(await screen.findByText("Used for agent_execution")).toBeTruthy();
    const loadMore = screen.getByRole("button", { name: "Load more" });
    fireEvent.click(loadMore);
    fireEvent.click(loadMore);
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(([url]) =>
          String(url).includes("/entities/user%2F42/credit-operations"),
        ),
      ).toHaveLength(2);
    });
    resolveNextPage?.(
      jsonResponse({
        customer_id: "acme/west",
        entity_id: "user/42",
        operations: [operation],
        next_cursor: null,
      }),
    );
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    });
    expect(screen.getAllByText("Used for agent_execution")).toHaveLength(1);
  });
});
