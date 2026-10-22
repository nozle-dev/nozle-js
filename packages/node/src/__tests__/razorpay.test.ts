import { afterEach, describe, expect, it, vi } from "vitest";
import { Nozle } from "../client";
import { NozleApiError } from "../errors";
import type { CheckoutResult, CheckoutStatus } from "../types";

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
  it.each([undefined, "https://engine.example", "https://api.example/nested/engine///"])("preserves the service prefix and checkout contracts with base %s", async (baseUrl) => {
    const fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => checkout });
    vi.stubGlobal("fetch", fetch);
    const client = new Nozle({
      apiKey: "sk_test",
      baseUrl,
    });
    const expectedBase = baseUrl?.replace(/\/+$/, "") ?? "https://api.nozle.app/engine";
    expect(
      await client.checkout("customer", "pro", undefined, {
        idempotencyKey: "retry-1",
        registerMandate: true,
      }),
    ).toEqual(checkout);
    expect(fetch.mock.calls[0][0]).toBe(`${expectedBase}/api/v1/checkout`);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      customer_id: "customer",
      plan_code: "pro",
      register_mandate: true,
    });
    expect(fetch.mock.calls[0][1].headers["Idempotency-Key"]).toBe("retry-1");
    await client.checkoutInvoice("invoice-1");
    expect(fetch.mock.calls[1][0]).toBe(`${expectedBase}/api/v1/checkout`);
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
      `${expectedBase}/api/v1/checkout/checkout-1/verify`,
    );
    expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual(proof);
    expect(await client.checkoutStatus("checkout-1")).toEqual(status);
    expect(fetch.mock.calls[3][0]).toBe(`${expectedBase}/api/v1/checkout/checkout-1`);
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

describe("checkout results and errors", () => {
  it("passes through every Razorpay and Stripe result shape the API returns", async () => {
    const results: CheckoutResult[] = [
      {
        type: "razorpay",
        checkout_id: "c1",
        key_id: "rzp_test_k",
        order_id: "order_1",
        amount_cents: 99900,
        currency: "INR",
        expires_at: "2026-10-14T09:30:00.000Z",
        customer_id: "cust_rzp",
        recurring: true,
        mandate_max_amount_cents: 500000,
        plan_upgrade_intent_id: "intent-1",
        external_subscription_id: "sub-1",
      },
      {
        type: "hosted",
        payment_url: "https://rzp.io/i/abc",
        checkout_id: "c2",
        amount_cents: 500,
        currency: "INR",
        expires_at: "2026-10-14T09:30:00.000Z",
        invoice_id: "inv-1",
      },
      { type: "processing", checkout_id: "c3", status: "processing", currency: "INR" },
      {
        type: "stripe",
        client_secret: "cs_test_1",
        clientSecret: "cs_test_1",
        plan_upgrade_intent_id: "intent-2",
        amount_cents: 1000,
        currency: "USD",
      },
      {
        type: "completed",
        status: "succeeded",
        payment_source: "credits",
        subscription_id: "s1",
        plan_code: "pro",
        invoice_id: "inv-2",
        amount_cents: 0,
        currency: "USD",
      },
      {
        type: "scheduled",
        status: "pending",
        subscription_id: "s2",
        plan_code: "starter",
        transition_direction: "downgrade",
        transition_policy: "next_period",
        effective_at: "2026-11-01T00:00:00.000000Z",
      },
    ];
    const fetch = vi.fn();
    for (const result of results)
      fetch.mockResolvedValueOnce({ ok: true, json: async () => result });
    vi.stubGlobal("fetch", fetch);
    const client = new Nozle({ apiKey: "sk_test" });
    for (const result of results)
      expect(await client.checkout("customer", "pro")).toEqual(result);
  });

  it("types checkout status with the nested resumable checkout", async () => {
    const body: CheckoutStatus = {
      checkout_id: "c1",
      provider: "razorpay",
      status: "awaiting_payment",
      fulfillment_status: "pending",
      amount_cents: 1000,
      currency: "INR",
      invoice_id: "inv-1",
      checkout: { type: "razorpay", checkout_id: "c1", key_id: "k", order_id: "o", amount_cents: 1000, currency: "INR" },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => body }));
    const client = new Nozle({ apiKey: "sk_test" });
    expect(await client.checkoutStatus("c1")).toEqual(body);
  });

  it("exposes the API error code and validation details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        statusText: "Unprocessable Entity",
        json: async () => ({
          status: 422,
          code: "validation_errors",
          error_details: { base: ["razorpay_requires_inr"] },
        }),
      }),
    );
    const client = new Nozle({ apiKey: "sk_test" });
    const error = await client.checkout("customer", "pro").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NozleApiError);
    const api = error as NozleApiError;
    expect(api.message).toBe("checkout failed: 422 Unprocessable Entity");
    expect(api.status).toBe(422);
    expect(api.code).toBe("validation_errors");
    expect(api.hasCode("razorpay_requires_inr")).toBe(true);
    expect(api.hasCode("payment_provider_required")).toBe(false);
  });

  it("labels status failures with their own operation and tolerates a non-JSON body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
        json: async () => {
          throw new SyntaxError("not json");
        },
      }),
    );
    const client = new Nozle({ apiKey: "sk_test" });
    await expect(client.checkoutStatus("missing")).rejects.toThrow("checkoutStatus failed: 404 Not Found");
    const error = (await client.checkoutStatus("missing").catch((e: unknown) => e)) as NozleApiError;
    expect(error.code).toBeUndefined();
    expect(error.hasCode("checkout_session_not_found")).toBe(false);
  });

  it.each(["razorpay_order_id", "razorpay_payment_id", "razorpay_signature"] as const)(
    "rejects a verification without %s before any request",
    async (field) => {
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      const proof = { razorpay_order_id: "o", razorpay_payment_id: "p", razorpay_signature: "s", [field]: "" };
      await expect(new Nozle({ apiKey: "sk_test" }).verifyCheckout("c1", proof)).rejects.toThrow(
        `verifyCheckout requires ${field}`,
      );
      expect(fetch).not.toHaveBeenCalled();
    },
  );
});

describe("managePaymentMethod", () => {
  const stripe = { url: "https://billing.stripe.com/x", expires_at: null, provider: "stripe" };
  it("posts to the customer route and unwraps the result", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ manage_payment_method: stripe }) });
    vi.stubGlobal("fetch", fetch);
    const client = new Nozle({ apiKey: "sk_test", baseUrl: "https://engine.example/" });
    expect(
      await client.managePaymentMethod("cust/1", "https://app.example/back", { idempotencyKey: "k1" }),
    ).toEqual(stripe);
    expect(fetch.mock.calls[0][0]).toBe("https://engine.example/api/v1/customers/cust%2F1/payment-method/manage");
    expect(fetch.mock.calls[0][1].method).toBe("POST");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ return_url: "https://app.example/back" });
    expect(fetch.mock.calls[0][1].headers["Idempotency-Key"]).toBe("k1");
    await client.managePaymentMethod("cust");
    expect(fetch.mock.calls[1][1].body).toBeUndefined();
  });
  it("is server-only and validates input", async () => {
    await expect(new Nozle({ apiKey: "pk_browser" }).managePaymentMethod("c")).rejects.toThrow("secret key");
    await expect(new Nozle({ apiKey: "sk_test" }).managePaymentMethod(" ")).rejects.toThrow("customerId");
  });
  it("raises the API error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false, status: 422, headers: new Headers(), text: async () => '{"error":"no_linked_payment_provider"}',
      json: async () => ({ error: "no_linked_payment_provider" }),
    }));
    await expect(new Nozle({ apiKey: "sk_test", maxRetries: 0 }).managePaymentMethod("c")).rejects.toBeInstanceOf(NozleApiError);
  });
  it("raises razorpay_pays_by_link for a Razorpay customer", async () => {
    const body = { status: 422, error: "Unprocessable Entity", code: "validation_errors", error_details: { base: ["razorpay_pays_by_link"] } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false, status: 422, statusText: "Unprocessable Entity", headers: new Headers(), json: async () => body,
    }));
    const error = await new Nozle({ apiKey: "sk_test", maxRetries: 0 }).managePaymentMethod("c").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NozleApiError);
    expect((error as NozleApiError).status).toBe(422);
    expect((error as NozleApiError).hasCode("razorpay_pays_by_link")).toBe(true);
  });
});
