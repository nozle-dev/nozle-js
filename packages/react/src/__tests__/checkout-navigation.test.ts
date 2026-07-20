import { describe, expect, it, vi } from "vitest";

import { navigateToCheckout } from "../components/billing/checkout-navigation";

describe("navigateToCheckout", () => {
  it("uses same-page location assignment instead of a popup", () => {
    const assign = vi.fn();

    navigateToCheckout("https://checkout.example.test/session", { assign });

    expect(assign).toHaveBeenCalledWith("https://checkout.example.test/session");
  });
});
