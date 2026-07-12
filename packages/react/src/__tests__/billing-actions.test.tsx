import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";

import { BillingPortalProvider } from "../components/billing/BillingPortalProvider";
import { CancelSubscriptionButton } from "../components/billing/CancelSubscriptionButton";
import { CheckoutButton } from "../components/billing/CheckoutButton";
import { CreditTopUpButton } from "../components/billing/CreditTopUpButton";
import { UpgradeModal } from "../components/billing/UpgradeModal";

const apiBaseUrl = "https://api.example.test";
const apiKey = "pk_test";
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
      apiKey={apiKey}
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
        apiKey={apiKey}
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
        apiKey={apiKey}
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
        apiKey={apiKey}
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
        apiKey={apiKey}
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
        type: "stripe",
        client_secret: "cs_credit",
        amount_dollars: 10,
        credits: 250,
      }),
    );
    const onCheckoutCreated = vi.fn();
    const onStripeClientSecret = vi.fn();

    const view = render(
      portal(
        <CreditTopUpButton
          onCheckoutCreated={onCheckoutCreated}
          onStripeClientSecret={onStripeClientSecret}
        />,
      ),
    );
    fireEvent.click(view.getByRole("button", { name: "Add Credits" }));
    fireEvent.click(view.getByRole("button", { name: "Add $10" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/api/v1/credits/purchase`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          customer_id: customerId,
          amount_dollars: 10,
        }),
      }),
    );
    expect(onCheckoutCreated).toHaveBeenCalledWith(
      expect.objectContaining({ credits: 250 }),
    );
    expect(onStripeClientSecret).toHaveBeenCalledWith("cs_credit");
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
          Authorization: `Bearer ${apiKey}`,
        }),
      }),
    );
  });
});
