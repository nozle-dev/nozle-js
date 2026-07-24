import React from "react";
import {describe, expect, it, vi} from "vitest";
import {fireEvent, render, waitFor} from "@testing-library/react";

const stripe = vi.hoisted(() => ({
  confirmPayment: vi.fn(),
}));

vi.mock("@stripe/stripe-js", () => ({
  loadStripe: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@stripe/react-stripe-js", () => ({
  EmbeddedCheckoutProvider: ({children, options}: {children: React.ReactNode; options: {clientSecret: string}}) => (
    <div data-testid="embedded-provider" data-client-secret={options.clientSecret}>{children}</div>
  ),
  EmbeddedCheckout: () => <div data-testid="embedded-checkout" />,
  Elements: ({children}: {children: React.ReactNode}) => <div data-testid="elements-provider">{children}</div>,
  PaymentElement: () => <div data-testid="payment-element" />,
  useStripe: () => ({confirmPayment: stripe.confirmPayment}),
  useElements: () => ({}),
}));

import {Checkout} from "../components/billing/Checkout";

describe("Checkout secret routing", () => {
  it("mounts Stripe Embedded Checkout for Checkout Session secrets", () => {
    const view = render(
      <Checkout clientSecret="cs_test_session_secret" publishableKey="pk_test" />,
    );

    expect(view.getByTestId("embedded-provider").getAttribute("data-client-secret")).toBe(
      "cs_test_session_secret",
    );
    expect(view.getByTestId("embedded-checkout")).toBeTruthy();
    expect(view.queryByTestId("payment-element")).toBeNull();
  });

  it("keeps PaymentElement support for PaymentIntent secrets", () => {
    const view = render(
      <Checkout clientSecret="pi_test_secret_123" publishableKey="pk_test" />,
    );

    expect(view.getByTestId("elements-provider")).toBeTruthy();
    expect(view.getByTestId("payment-element")).toBeTruthy();
    expect(view.queryByTestId("embedded-checkout")).toBeNull();
  });

  it("uses the caller return URL when confirming a PaymentElement payment", async () => {
    stripe.confirmPayment.mockResolvedValueOnce({
      paymentIntent: {id: "pi_test", status: "succeeded"},
    });
    const view = render(
      <Checkout
        clientSecret="pi_test_secret_123"
        publishableKey="pk_test"
        returnUrl="https://merchant.example/billing/complete"
      />,
    );

    fireEvent.click(view.getByRole("button", {name: "Pay now"}));

    await waitFor(() =>
      expect(stripe.confirmPayment).toHaveBeenCalledWith({
        elements: {},
        confirmParams: {return_url: "https://merchant.example/billing/complete"},
        redirect: "if_required",
      }),
    );
  });
});
