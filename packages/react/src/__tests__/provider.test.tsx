import { describe, it, expect, vi } from "vitest";
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

  it("keeps publishable and customer-session credentials separate", () => {
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
  });

  it("throws error when useBillingContext used outside provider", () => {
    expect(() => {
      renderHook(() => useBillingContext());
    }).toThrow("useBillingContext must be used within a BillingProvider");
  });
});
