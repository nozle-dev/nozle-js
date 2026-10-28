import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, renderHook, waitFor } from "@testing-library/react";
import { Checkout, CheckoutButton, BillingProvider, useCheckout, useCheckoutSession } from "../index";

const hosted = {
  type: "hosted" as const,
  url: "https://checkout.stripe.com/c/pay/cs_test_hosted",
  payment_url: "https://checkout.stripe.com/c/pay/cs_test_hosted",
  checkout_id: "cs_test_hosted",
  invoice_id: "inv_1",
  amount_cents: 1000,
  currency: "USD",
};

function stubLocation() {
  const assign = vi.fn();
  vi.stubGlobal("location", { assign, href: "https://merchant.example/billing?token=abc#x", origin: "https://merchant.example", pathname: "/billing" });
  return assign;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const noStripeScript = () => expect(document.querySelector('script[src*="stripe"]')).toBeNull();

describe("Checkout children", () => {
  it("renders children instead of the default button and lets useCheckout start the payment", async () => {
    const assign = stubLocation();
    function MyPay() {
      const { confirmPayment, isProcessing } = useCheckout();
      return <button onClick={() => void confirmPayment()} disabled={isProcessing}>Custom pay</button>;
    }
    const view = render(<Checkout checkout={hosted}><MyPay /></Checkout>);
    expect(view.queryByRole("button", { name: "Pay now" })).toBeNull();
    fireEvent.click(view.getByRole("button", { name: "Custom pay" }));
    await waitFor(() => expect(assign).toHaveBeenCalledExactlyOnceWith(hosted.url));
  });
});

describe("hosted Stripe checkout", () => {
  it("Checkout redirects to the hosted url and loads no Stripe script", async () => {
    const assign = stubLocation();
    const view = render(<Checkout checkout={hosted} />);
    fireEvent.click(view.getByRole("button", { name: "Pay now" }));
    await waitFor(() => expect(assign).toHaveBeenCalledExactlyOnceWith(hosted.url));
    noStripeScript();
  });

  it("CheckoutButton redirects to url", async () => {
    const assign = stubLocation();
    const createCheckout = vi.fn().mockResolvedValue(hosted);
    const view = render(
      <BillingProvider publishableKey="pk_test" createCheckout={createCheckout}>
        <CheckoutButton planCode="pro" returnUrl="https://merchant.example/done" />
      </BillingProvider>,
    );
    fireEvent.click(view.getByRole("button", { name: "Get Started" }));
    await waitFor(() => expect(assign).toHaveBeenCalledExactlyOnceWith(hosted.url));
    noStripeScript();
  });

  it("a hosted Stripe result never triggers a status poll with its checkout_id", async () => {
    const assign = stubLocation();
    const getCheckoutStatus = vi.fn();
    const verifyCheckout = vi.fn();
    const createCheckout = vi
      .fn()
      .mockResolvedValue({ ...hosted, plan_upgrade_intent_id: "intent_1", invoice_id: undefined });
    const view = render(
      <BillingProvider
        publishableKey="pk_test"
        createCheckout={createCheckout}
        getCheckoutStatus={getCheckoutStatus}
        verifyCheckout={verifyCheckout}
      >
        <CheckoutButton planCode="pro" returnUrl="https://merchant.example/done" />
      </BillingProvider>,
    );
    fireEvent.click(view.getByRole("button", { name: "Get Started" }));
    await waitFor(() => expect(assign).toHaveBeenCalledExactlyOnceWith(hosted.url));
    expect(getCheckoutStatus).not.toHaveBeenCalled();
    expect(verifyCheckout).not.toHaveBeenCalled();
  });

  it("useCheckoutSession redirects a hosted result", async () => {
    const assign = stubLocation();
    const createCheckout = vi.fn().mockResolvedValue(hosted);
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <BillingProvider publishableKey="pk_test" createCheckout={createCheckout}>
        {children}
      </BillingProvider>
    );
    const { result } = renderHook(() => useCheckoutSession(), { wrapper });
    await result.current.startCheckout("pro", "https://merchant.example/done");
    expect(assign).toHaveBeenCalledExactlyOnceWith(hosted.url);
  });

  it("explains the required checkout context", () => {
    expect(() => renderHook(() => useCheckout())).toThrow(
      "useCheckout must be used inside a <Checkout> component",
    );
  });
});

describe("no embedded Stripe left", () => {
  const root = join(__dirname, "..", "..");
  const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return name === "__tests__" ? [] : sources(path);
      return /\.tsx?$/.test(name) ? [path] : [];
    });

  it("has no client secret, Stripe package or Stripe peer dependency", () => {
    for (const file of sources(join(root, "src"))) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/client_?secret|@stripe\//i);
    }
    const peers = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).peerDependencies;
    expect(Object.keys(peers).filter((name) => name.startsWith("@stripe/"))).toEqual([]);
    expect(readFileSync(join(root, "README.md"), "utf8")).not.toMatch(/client_?secret|@stripe\//i);
  });
});

describe("CheckoutButton defaults and errors", () => {
  it("returns to the current page without its query string or hash", async () => {
    stubLocation();
    const createCheckout = vi.fn().mockResolvedValue(hosted);
    const view = render(
      <BillingProvider publishableKey="pk_test" createCheckout={createCheckout}>
        <CheckoutButton planCode="pro" />
      </BillingProvider>,
    );
    fireEvent.click(view.getByRole("button", { name: "Get Started" }));
    await waitFor(() => expect(createCheckout).toHaveBeenCalled());
    expect(createCheckout.mock.calls[0][0].returnUrl).toBe("https://merchant.example/billing");
  });

  it("shows a friendly message and hands the raw error to onError", async () => {
    stubLocation();
    const raw = new Error("checkout failed: 422 Unprocessable Entity: plan_not_found");
    const onError = vi.fn();
    const view = render(
      <BillingProvider publishableKey="pk_test" createCheckout={vi.fn().mockRejectedValue(raw)}>
        <CheckoutButton planCode="pro" onError={onError} />
      </BillingProvider>,
    );
    fireEvent.click(view.getByRole("button", { name: "Get Started" }));
    const alert = await view.findByRole("alert");
    expect(alert.textContent).toBe("We couldn't start checkout. Please try again.");
    expect(onError).toHaveBeenCalledWith(raw);
  });
});
