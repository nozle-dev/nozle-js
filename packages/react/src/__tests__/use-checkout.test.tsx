import React, { type ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { navigateToCheckout } from "../components/billing/checkout-navigation.js";
import { useCheckout } from "../hooks/use-checkout";
import { BillingProvider } from "../provider";

vi.mock("../components/billing/checkout-navigation.js", () => ({
  navigateToCheckout: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useCheckout", () => {
  it("uses same-page navigation for hosted Stripe checkout URLs", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        type: "stripe",
        url: "https://checkout.example.test/session",
      }),
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
    const { result } = renderHook(() => useCheckout(), { wrapper });

    await act(async () => {
      await expect(result.current.fetchClientSecret("pro")).resolves.toBeNull();
    });

    expect(navigateToCheckout).toHaveBeenCalledWith(
      "https://checkout.example.test/session",
    );
    expect(result.current.checkout).toEqual({
      type: "stripe",
      url: "https://checkout.example.test/session",
    });
  });
});
