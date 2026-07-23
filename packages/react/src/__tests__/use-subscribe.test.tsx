import React, { type ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useSubscribe } from "../hooks/use-subscribe";
import { BillingProvider } from "../provider";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useSubscribe", () => {
  it("routes browser plan selection through checkout instead of direct subscribe", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ type: "stripe", client_secret: "cs_checkout" }),
    } as Response);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <BillingProvider
        customerId="customer-1"
        customerSessionToken="csess_customer-1"
        baseUrl="https://api.example.test"
      >
        {children}
      </BillingProvider>
    );
    const { result } = renderHook(() => useSubscribe(), { wrapper });

    await act(async () => {
      await result.current.subscribe("pro");
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/api/v1/checkout",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ plan_code: "pro", customer_id: "customer-1" }),
      }),
    );
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).endsWith("/api/v1/subscribe"),
      ),
    ).toBe(false);
  });
});
