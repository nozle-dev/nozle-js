import { afterEach, describe, expect, it, vi } from "vitest";
import { Nozle } from "../client";

const checkout = {
  type: "razorpay",
  checkout_id: "checkout-1",
  key_id: "rzp_test_public",
  order_id: "order_1",
  amount_cents: 1000,
  currency: "INR",
};
const status = {
  checkout_id: "checkout-1",
  provider: "razorpay",
  status: "processing",
  fulfillment_status: "pending",
};
afterEach(() => vi.unstubAllGlobals());
describe("Razorpay server checkout", () => {
  it("forwards invoice/mandate/idempotency and verification without assuming success", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => checkout });
    vi.stubGlobal("fetch", fetch);
    const client = new Nozle({
      apiKey: "sk_test",
      baseUrl: "https://engine.example",
    });
    expect(
      await client.checkout("customer", "pro", undefined, {
        idempotencyKey: "retry-1",
        registerMandate: true,
      }),
    ).toEqual(checkout);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      customer_id: "customer",
      plan_code: "pro",
      register_mandate: true,
    });
    expect(fetch.mock.calls[0][1].headers["Idempotency-Key"]).toBe("retry-1");
    await client.checkoutInvoice("invoice-1");
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
      invoice_id: "invoice-1",
    });
    fetch.mockResolvedValue({ ok: true, json: async () => status });
    const proof = {
      razorpay_order_id: "order_1",
      razorpay_payment_id: "pay_1",
      razorpay_signature: "signature",
    };
    expect(await client.verifyCheckout("checkout-1", proof)).toEqual(status);
    expect(fetch.mock.calls[2][0]).toBe(
      "https://engine.example/api/v1/checkout/checkout-1/verify",
    );
    expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual(proof);
    expect(await client.checkoutStatus("checkout-1")).toEqual(status);
  });
  it("keeps all collection endpoints server-only", async () => {
    const client = new Nozle({ apiKey: "pk_browser" });
    await expect(client.checkoutInvoice("invoice")).rejects.toThrow(
      "secret key",
    );
    await expect(client.checkoutStatus("checkout")).rejects.toThrow(
      "secret key",
    );
    await expect(
      client.verifyCheckout("checkout", {
        razorpay_order_id: "order",
        razorpay_payment_id: "pay",
        razorpay_signature: "sig",
      }),
    ).rejects.toThrow("secret key");
  });
});
