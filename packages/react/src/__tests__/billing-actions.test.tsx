import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";

import { BillingPortalProvider } from "../components/billing/BillingPortalProvider";
import { CancelSubscriptionButton } from "../components/billing/CancelSubscriptionButton";
import { CheckoutButton } from "../components/billing/CheckoutButton";
import { CreditTopUpButton } from "../components/billing/CreditTopUpButton";
import { UpgradeModal } from "../components/billing/UpgradeModal";

const navigateToCheckout = vi.hoisted(() => vi.fn());

vi.mock("../components/billing/checkout-navigation.js", () => ({
  navigateToCheckout,
}));

const apiBaseUrl = "https://api.example.test";
const customerSessionToken = "csess_customer_123";
const customerId = "customer_123";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function portal(children: React.ReactNode) {
  return (
    <BillingPortalProvider
      customerSessionToken={customerSessionToken}
      customerId={customerId}
      apiBaseUrl={apiBaseUrl}
    >
      {children}
    </BillingPortalProvider>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("billing action API contract", () => {
  it("rejects publishable and secret keys as portal customer credentials", () => {
    expect(() =>
      render(
        <BillingPortalProvider customerId={customerId} apiKey="pk_browser">
          <div />
        </BillingPortalProvider>,
      ),
    ).toThrow("requires a scoped customerSessionToken");
    expect(() =>
      render(
        <BillingPortalProvider customerId={customerId} apiKey="sk_server">
          <div />
        </BillingPortalProvider>,
      ),
    ).toThrow("requires a scoped customerSessionToken");
  });

  it("sends canonical checkout fields", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ type: "stripe", clientSecret: "cs_123" }));
    const onStripeClientSecret = vi.fn();

    const view = render(
      portal(
        <CheckoutButton
          planId="pro"
          onStripeClientSecret={onStripeClientSecret}
        />,
      ),
    );
    fireEvent.click(view.getByRole("button", { name: "Get Started" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/api/v1/checkout`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          plan_code: "pro",
          customer_id: customerId,
        }),
      }),
    );
    expect(onStripeClientSecret).toHaveBeenCalledWith("cs_123");
  });

  it("reports a credit-funded checkout as completed without mounting Stripe", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        type: "completed",
        status: "succeeded",
        payment_source: "credits",
        plan_code: "pro",
      }),
    );
    const onComplete = vi.fn();
    const onStripeClientSecret = vi.fn();

    const view = render(
      portal(
        <CheckoutButton
          planId="pro"
          onComplete={onComplete}
          onStripeClientSecret={onStripeClientSecret}
        />,
      ),
    );
    fireEvent.click(view.getByRole("button", {name: "Get Started"}));

    await waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({type: "completed", plan_code: "pro"}),
    );
    expect(onStripeClientSecret).not.toHaveBeenCalled();
  });

  it("previews the change and starts payment checkout on confirmation", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({
          credit: 0,
          debit: 29.99,
          net: 29.99,
          nextBillingDate: "2026-08-10",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ type: "stripe", client_secret: "cs_upgrade" }),
      );
    const onStripeClientSecret = vi.fn();
    const onConfirm = vi.fn();

    const view = render(
      <UpgradeModal
        isOpen
        targetPlanId="max"
        customerId={customerId}
        apiBaseUrl={apiBaseUrl}
        customerSessionToken={customerSessionToken}
        onStripeClientSecret={onStripeClientSecret}
        onConfirm={onConfirm}
      />,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.click(
      view.getByRole("button", { name: "Confirm Upgrade" }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${apiBaseUrl}/api/v1/subscriptions/preview`,
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`${apiBaseUrl}/api/v1/checkout`);
    for (const call of fetchMock.mock.calls) {
      expect(call[1]).toEqual(expect.objectContaining({
        body: JSON.stringify({plan_code: "max", customer_id: customerId}),
      }));
    }
    expect(onStripeClientSecret).toHaveBeenCalledWith("cs_upgrade");
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("does not report an upgrade when embedded checkout cannot be mounted", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({credit: 0, debit: 10, net: 10, nextBillingDate: "2026-08-10"}))
      .mockResolvedValueOnce(jsonResponse({type: "stripe", client_secret: "cs_upgrade"}));
    const onConfirm = vi.fn();

    const view = render(
      <UpgradeModal
        isOpen
        targetPlanId="max"
        customerId={customerId}
        apiBaseUrl={apiBaseUrl}
        customerSessionToken={customerSessionToken}
        onConfirm={onConfirm}
      />,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.click(view.getByRole("button", {name: "Confirm Upgrade"}));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(await view.findByText("onStripeClientSecret is required for embedded Stripe checkout")).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("reports a credit-funded modal upgrade as completed", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({credit: 5, debit: 5, net: 0, nextBillingDate: "2026-08-10"}))
      .mockResolvedValueOnce(jsonResponse({type: "completed", status: "succeeded"}));
    const onCompleted = vi.fn();
    const onStripeClientSecret = vi.fn();

    const view = render(
      <UpgradeModal
        isOpen
        targetPlanId="max"
        customerId={customerId}
        apiBaseUrl={apiBaseUrl}
        customerSessionToken={customerSessionToken}
        onCompleted={onCompleted}
        onStripeClientSecret={onStripeClientSecret}
      />,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(await view.findByText("Credits applied")).toBeTruthy();
    fireEvent.click(view.getByRole("button", {name: "Confirm Upgrade"}));
    await waitFor(() => expect(onCompleted).toHaveBeenCalledOnce());
    expect(onStripeClientSecret).not.toHaveBeenCalled();
  });

  it("schedules a Lago downgrade when checkout says payment is not required", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({credit: 0, debit: 0, net: 0, nextBillingDate: "2026-08-10"}))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: "checkout_not_required_for_downgrade",
            code: "checkout_not_required_for_downgrade",
          },
          422,
        ),
      )
      .mockResolvedValueOnce(jsonResponse({subscription: {status: "pending"}}));
    const onScheduled = vi.fn();

    const view = render(
      <UpgradeModal
        isOpen
        targetPlanId="pro-annual"
        customerId={customerId}
        apiBaseUrl={apiBaseUrl}
        customerSessionToken={customerSessionToken}
        onScheduled={onScheduled}
      />,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.click(view.getByRole("button", {name: "Confirm Upgrade"}));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`${apiBaseUrl}/api/v1/checkout`);
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      `${apiBaseUrl}/api/v1/subscriptions/change`,
    );
    expect(onScheduled).toHaveBeenCalledOnce();
  });

  it("creates credit checkout without claiming payment success", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        credit_top_up_purchase: {
          lago_id: "purchase-1",
          payment_url: "https://checkout.example.test/top-up",
          payment_status: "pending",
          credit_amount: "250.000000000000",
          amount_cents: 1000,
          currency: "USD",
          package_code: "starter_pack",
          replayed: false,
        },
      }),
    );
    const onCheckoutCreated = vi.fn();

    const view = render(
      portal(
        <CreditTopUpButton
          creditSystemCode="ai_credits"
          topUpPackageCode="starter_pack"
          packageName="Starter pack"
          creditAmount="250"
          priceLabel="$10.00"
          onCheckoutCreated={onCheckoutCreated}
        />,
      ),
    );
    fireEvent.click(view.getByRole("button", { name: "Add Credits" }));
    expect(view.getByText("250 credits · $10.00")).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "Buy Starter pack" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/api/v1/credit-top-up-purchases`,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: `Bearer ${customerSessionToken}`,
          "Idempotency-Key": expect.any(String),
        }),
        body: JSON.stringify({
          customer_id: customerId,
          credit_system_code: "ai_credits",
          top_up_package_code: "starter_pack",
        }),
      }),
    );
    expect(onCheckoutCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        credit_top_up_purchase: expect.objectContaining({
          lago_id: "purchase-1",
          credit_amount: "250.000000000000",
        }),
      }),
    );
    expect(navigateToCheckout).toHaveBeenCalledWith(
      "https://checkout.example.test/top-up",
    );
  });

  it("reuses the package purchase idempotency key after a failed response", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("connection lost"))
      .mockResolvedValueOnce(
        jsonResponse({
          credit_top_up_purchase: {
            lago_id: "purchase-1",
            payment_url: "https://checkout.example.test/top-up",
            payment_status: "pending",
            credit_amount: "250",
            amount_cents: 1000,
            currency: "USD",
            package_code: "starter_pack",
            replayed: true,
          },
        }),
      );
    const view = render(
      portal(
        <CreditTopUpButton
          creditSystemCode="ai_credits"
          topUpPackageCode="starter_pack"
          packageName="Starter pack"
        />,
      ),
    );
    fireEvent.click(view.getByRole("button", { name: "Add Credits" }));
    const buy = view.getByRole("button", { name: "Buy Starter pack" });
    fireEvent.click(buy);
    await waitFor(() => expect(view.getByText("connection lost")).toBeTruthy());
    fireEvent.click(buy);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const firstHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    const secondHeaders = fetchMock.mock.calls[1]?.[1]?.headers as Record<string, string>;
    expect(secondHeaders["Idempotency-Key"]).toBe(firstHeaders["Idempotency-Key"]);
  });

  it("authenticates and scopes cancellation through the configured API", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ subscription: { status: "terminated" } }));

    const view = render(
      portal(<CancelSubscriptionButton subscriptionId="sub/customer" />),
    );
    fireEvent.click(
      view.getByRole("button", { name: "Cancel Subscription" }),
    );
    fireEvent.click(view.getByRole("button", { name: "Confirm Cancel" }));
    fireEvent.click(view.getByRole("radio", { name: "Too expensive" }));
    fireEvent.click(
      view.getByRole("button", { name: "Submit Cancellation" }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/api/v1/subscriptions/sub%2Fcustomer`,
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({
          Authorization: `Bearer ${customerSessionToken}`,
        }),
        body: JSON.stringify({
          reason: "Too expensive",
          customer_id: customerId,
        }),
      }),
    );
  });
});
