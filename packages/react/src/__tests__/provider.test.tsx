import { beforeEach, describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { BillingProvider, useBillingContext } from "../provider";

// Mock centrifuge module to avoid actual WebSocket connections
vi.mock("centrifuge", () => {
  const mockSub = {
    on: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  };
  const mockCentrifuge = {
    on: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    newSubscription: vi.fn(() => mockSub),
  };
  return {
    Centrifuge: vi.fn(() => mockCentrifuge),
  };
});

// Mock fetch for store.fetchInitialState
const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ plan_slug: "free", features: {}, limits: {}, credits: 0, subscription_status: "active", balance: 0, currency: "USD" }),
});
global.fetch = mockFetch;

describe("BillingProvider", () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it("renders children", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <BillingProvider
        publishableKey="pk_browser"
        customerId="cust_123"
        baseUrl="http://localhost:8080"
      >
        {children}
      </BillingProvider>
    );

    const { result } = renderHook(() => useBillingContext(), { wrapper });

    expect(result.current.client).toBeDefined();
    expect(result.current.customerId).toBe("cust_123");
  });

  it("keeps publishable and customer-session credentials separate", async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <BillingProvider
        customerSessionToken="csess_customer"
        publishableKey="pk_browser"
        customerId="cust_123"
        baseUrl="http://localhost:8080"
      >
        {children}
      </BillingProvider>
    );

    const { result } = renderHook(() => useBillingContext(), { wrapper });

    expect(result.current.client?.authToken).toBe("pk_browser");
    expect(result.current.client?.apiKey).toBe("csess_customer");
    expect(result.current.client?.customerSessionToken).toBe("csess_customer");

    await result.current.client?.catalogFetch("/api/v1/plans");
    expect(mockFetch).toHaveBeenLastCalledWith(
      "http://localhost:8080/api/v1/plans",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer pk_browser" }),
      }),
    );
    await result.current.client?.creditFetch(
      "/api/v1/customers/cust_123/credit-systems",
    );
    expect(mockFetch).toHaveBeenLastCalledWith(
      "http://localhost:8080/api/v1/customers/cust_123/credit-systems",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer csess_customer",
        }),
      }),
    );
  });

  it("supports session-only providers for customer billing but not catalog", async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <BillingProvider customerSessionToken="csess_customer">
        {children}
      </BillingProvider>
    );

    const { result } = renderHook(() => useBillingContext(), { wrapper });
    expect(result.current.client?.authToken).toBe("csess_customer");
    expect(result.current.client?.customerSessionToken).toBe("csess_customer");
    await expect(result.current.client?.catalogFetch("/api/v1/plans")).rejects.toThrow(
      "requires a publishable key",
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("never uses a publishable key for customer operations", async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <BillingProvider publishableKey="pk_browser">{children}</BillingProvider>
    );
    const { result } = renderHook(() => useBillingContext(), { wrapper });

    await expect(
      result.current.client?.customerFetch("/api/v1/billing/status"),
    ).rejects.toThrow("requires a scoped customer session token");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects browser secret keys", () => {
    expect(() =>
      renderHook(() => useBillingContext(), {
        wrapper: ({ children }: { children: React.ReactNode }) => (
          <BillingProvider apiKey="sk_server_only">{children}</BillingProvider>
        ),
      }),
    ).toThrow("publishableKey must be a publishable key");
  });

  it("throws error when useBillingContext used outside provider", () => {
    expect(() => {
      renderHook(() => useBillingContext());
    }).toThrow("useBillingContext must be used within a BillingProvider");
  });
});
