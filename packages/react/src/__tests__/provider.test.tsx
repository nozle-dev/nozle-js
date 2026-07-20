import { beforeEach, describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
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
        publishableKey="bsr_pub_test"
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
    expect(result.current.client?.apiKey).toBe("pk_browser");
    expect(result.current.client?.customerSessionToken).toBe("csess_customer");

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8080/api/v1/auth/centrifugo-token",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer pk_browser",
          }),
        }),
      );
    });
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

  it("does not treat a customer session as a legacy portal credential", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <BillingProvider customerSessionToken="csess_customer">
        {children}
      </BillingProvider>
    );

    expect(() => renderHook(() => useBillingContext(), { wrapper })).toThrow(
      "BillingProvider requires apiKey or publishableKey",
    );
  });

  it("throws error when useBillingContext used outside provider", () => {
    expect(() => {
      renderHook(() => useBillingContext());
    }).toThrow("useBillingContext must be used within a BillingProvider");
  });
});
