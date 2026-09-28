import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Nozle } from "../index";

const fetcher = vi.fn();
const sdk = new Nozle({ apiKey: "sk_test", baseUrl: "https://engine.example" });
beforeEach(() => {
  fetcher
    .mockReset()
    .mockImplementation(async () => new Response(JSON.stringify({ ok: true })));
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => vi.unstubAllGlobals());
const body = () => JSON.parse(fetcher.mock.calls[0][1].body);

describe("subscription management", () => {
  it("loads customer-scoped options using external subscription identity", async () => {
    await sdk.subscriptionOptions("customer/one", "subscription/two");
    const url = new URL(fetcher.mock.calls[0][0]);
    expect(url.pathname).toBe("/api/v1/subscriptions/options");
    expect(url.searchParams.get("customer_id")).toBe("customer/one");
    expect(url.searchParams.get("subscription_id")).toBe("subscription/two");
  });
  it("previews a specific subscription and preserves the opaque quote response", async () => {
    const result = {
      quote_id: "opaque+quote/==",
      amount_due_now_cents: "12345678901234567890",
      effective_at: "2030-01-01T00:00:00.123456Z",
    };
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify(result)));
    expect(
      await sdk.previewSubscriptionChange("customer", "external-sub", "pro"),
    ).toEqual(result);
    expect(body()).toEqual({
      customer_id: "customer",
      subscription_id: "external-sub",
      plan_code: "pro",
    });
  });
  it("binds quoted checkout to the selected subscription and idempotency key", async () => {
    await sdk.checkout("customer", "pro", "https://merchant.example/billing", {
      subscriptionId: "selected",
      quoteId: "opaque+quote/==",
      idempotencyKey: "confirm-1",
    });
    expect(body()).toEqual({
      customer_id: "customer",
      plan_code: "pro",
      subscription_id: "selected",
      quote_id: "opaque+quote/==",
      return_url: "https://merchant.example/billing",
    });
    expect(fetcher.mock.calls[0][1].headers["Idempotency-Key"]).toBe(
      "confirm-1",
    );
  });
  it("rejects a quote without a selector", async () => {
    await expect(
      sdk.checkout("customer", "pro", undefined, { quoteId: "quote" }),
    ).rejects.toThrow(/subscriptionId/);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("scopes checkout recovery and verification to authenticated customer and subscription", async () => {
    const scope = { customerId: "customer", subscriptionId: "subscription" };
    await sdk.checkoutStatus("checkout/id", scope);
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://engine.example/api/v1/checkout/checkout%2Fid?customer_id=customer&subscription_id=subscription",
    );
    fetcher.mockClear();
    const verification = {
      razorpay_order_id: "order",
      razorpay_payment_id: "payment",
      razorpay_signature: "signature",
    };
    await sdk.verifyCheckout("checkout/id", verification, scope);
    expect(fetcher.mock.calls[0][0]).toContain(
      "/checkout%2Fid/verify?customer_id=customer&subscription_id=subscription",
    );
    expect(body()).toEqual(verification);
  });
  it("withdraws the exact pending UUID without canceling the active external subscription", async () => {
    await sdk.withdrawPendingSubscriptionChange(
      "customer",
      "active-external",
      "pending-uuid",
      "withdraw-1",
    );
    expect(body()).toEqual({
      customer_id: "customer",
      subscription_id: "active-external",
      pending_subscription_id: "pending-uuid",
    });
    expect(fetcher.mock.calls[0][0]).toContain(
      "/subscriptions/transitions/withdraw",
    );
    expect(fetcher.mock.calls[0][1].headers["Idempotency-Key"]).toBe(
      "withdraw-1",
    );
  });
  it("forwards quotes only for downgrade transitions", async () => {
    await sdk.applySubscriptionTransition(
      {
        customerId: "customer",
        subscriptionId: "active",
        operation: "downgrade",
        targetPlanCode: "basic",
        timing: "end_of_period",
        quoteId: "signed",
      },
      "schedule-1",
    );
    expect(body().quote_id).toBe("signed");
    await expect(
      sdk.applySubscriptionTransition(
        {
          customerId: "customer",
          subscriptionId: "active",
          operation: "cancel",
          quoteId: "signed",
        },
        "bad",
      ),
    ).rejects.toThrow(/downgrade/);
  });
  it("keeps upstream conflicts credential-safe", async () => {
    fetcher.mockResolvedValueOnce(
      new Response(JSON.stringify({ secret: "sk_do_not_echo" }), {
        status: 409,
        statusText: "Conflict",
      }),
    );
    await expect(
      sdk.previewSubscriptionChange("customer", "subscription", "pro"),
    ).rejects.toThrow("subscriptionManagement failed: 409 Conflict");
  });
  it("requires secret authentication and complete selectors before transport", async () => {
    await expect(
      new Nozle({ apiKey: "pk_catalog" }).subscriptionOptions("c", "s"),
    ).rejects.toThrow(/secret/);
    await expect(sdk.subscriptionOptions("", "s")).rejects.toThrow(
      /customerId/,
    );
    await expect(
      sdk.withdrawPendingSubscriptionChange("c", "s", "", "key"),
    ).rejects.toThrow(/pendingSubscriptionId/);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
