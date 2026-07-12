import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
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
  if (url.includes("/auth/centrifugo-token")) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ token: "fake-token" }),
    });
  }
  const feature = new URL(url).searchParams.get("feature");
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(
      fetchResponses[feature ?? "default"] ?? {
        allowed: feature === "ai_copilot",
        remaining: null,
        limit: null,
        used: 0,
      },
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

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.allowed).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it("returns allowed=false for disabled feature after fetch", async () => {
    const { result } = renderHook(() => useCan("advanced_reports"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.allowed).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("returns allowed=false for unknown feature", async () => {
    const { result } = renderHook(() => useCan("nonexistent_feature"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.allowed).toBe(false);
    expect(result.current.error).toBeNull();
  });
});
