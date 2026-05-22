import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { BillingProvider } from "../provider";
import { useCan } from "../hooks/use-can";

// Mock centrifuge module
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

// Mock fetch to return entitlements
let fetchResponses: Record<string, unknown> = {};

const mockFetch = vi.fn().mockImplementation((url: string) => {
  // Connection token
  if (url.includes("/realtime/token")) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ token: "fake-token" }),
    });
  }
  // Default: return entitlements-like response
  return Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve(
        fetchResponses["default"] ?? {
          plan_slug: "pro",
          subscription_status: "active",
          features: {
            ai_copilot: { enabled: true, source: "plan" },
            advanced_reports: { enabled: false, source: "plan" },
          },
          limits: {},
          credits: 100,
          balance: 100,
          currency: "USD",
        }
      ),
  });
});
global.fetch = mockFetch;

function wrapper({ children }: { children: ReactNode }) {
  return createElement(BillingProvider, {
    publishableKey: "bsr_pub_test",
    customerId: "cust_123",
    baseUrl: "http://localhost:8080",
    children,
  });
}

describe("useCan", () => {
  it("returns loading state initially", () => {
    const { result } = renderHook(() => useCan("ai_copilot"), { wrapper });

    // Initially before fetch completes, isLoading should be true
    // (entitlements is null)
    expect(result.current.isLoading).toBe(true);
    expect(result.current.allowed).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("returns allowed=true for enabled feature after fetch", async () => {
    const { result } = renderHook(() => useCan("ai_copilot"), { wrapper });

    // Wait for fetch to complete
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.allowed).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it("returns allowed=false for disabled feature after fetch", async () => {
    const { result } = renderHook(() => useCan("advanced_reports"), {
      wrapper,
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.allowed).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("returns allowed=false for unknown feature", async () => {
    const { result } = renderHook(() => useCan("nonexistent_feature"), {
      wrapper,
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.allowed).toBe(false);
    expect(result.current.error).toBeNull();
  });
});
