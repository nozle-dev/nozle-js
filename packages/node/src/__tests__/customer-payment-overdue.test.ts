import { afterEach, describe, expect, it, vi } from "vitest";
import { Nozle } from "../client";
import { CUSTOMER_PAYMENT_OVERDUE, NozleApiError, isCustomerPaymentOverdue, refusedEventIndexes, type EventBatchResponse } from "../index";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
afterEach(() => fetchMock.mockReset());

const paymentRequired = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 402, statusText: "Payment Required" });
const client = () => new Nozle({ apiKey: "sk_test", maxRetries: 3, retryDelayMs: 1 });

describe("customer_payment_overdue (402)", () => {
  it("can() returns a denial instead of throwing, once", async () => {
    fetchMock.mockResolvedValue(
      paymentRequired({ allowed: false, reason: CUSTOMER_PAYMENT_OVERDUE, code: CUSTOMER_PAYMENT_OVERDUE, error: "payment overdue" }),
    );
    await expect(client().can("c", "f")).resolves.toEqual({
      allowed: false,
      reason: "customer_payment_overdue",
      used: 0,
      limit: null,
      remaining: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("can() still throws another 402", async () => {
    fetchMock.mockResolvedValue(paymentRequired({ code: "workspace_suspended", error: "suspended" }));
    await expect(client().can("c", "f")).rejects.toMatchObject({ status: 402, code: "workspace_suspended" });
  });

  it.each([
    ["track", () => client().track("c", "e", {}, { subscriptionId: "s" })],
    ["usage.check", () => client().usage.check({ customerId: "c", featureCode: "f" })],
  ] as const)("%s throws NozleApiError with the code", async (_name, call) => {
    fetchMock.mockResolvedValue(paymentRequired({ code: CUSTOMER_PAYMENT_OVERDUE, error: "payment overdue" }));
    const error = await call().then(() => undefined, (cause: unknown) => cause);
    expect(error).toBeInstanceOf(NozleApiError);
    expect((error as NozleApiError).hasCode(CUSTOMER_PAYMENT_OVERDUE)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a partial batch (200) lists the refused events; the others were stored", () => {
    const body: EventBatchResponse = {
      events: [{ transaction_id: "t0" }, { transaction_id: "t2" }],
      error_details: {
        "3": { external_customer_id: [CUSTOMER_PAYMENT_OVERDUE] },
        "1": { external_customer_id: [CUSTOMER_PAYMENT_OVERDUE] },
      },
    };
    expect(refusedEventIndexes(body.error_details, CUSTOMER_PAYMENT_OVERDUE)).toEqual([1, 3]);
    expect(refusedEventIndexes(undefined, CUSTOMER_PAYMENT_OVERDUE)).toEqual([]);
  });

  it("an all-refused batch (402) lists every event on the error", () => {
    const error = new NozleApiError("events batch", { status: 402, statusText: "Payment Required" }, {
      status: 402,
      code: CUSTOMER_PAYMENT_OVERDUE,
      error: "payment overdue",
      error_details: {
        "1": { external_customer_id: [CUSTOMER_PAYMENT_OVERDUE] },
        "0": { external_customer_id: [CUSTOMER_PAYMENT_OVERDUE] },
      },
    });
    expect(error.hasCode(CUSTOMER_PAYMENT_OVERDUE)).toBe(true);
    expect(isCustomerPaymentOverdue(error)).toBe(true);
    expect(error.refusedEventIndexes(CUSTOMER_PAYMENT_OVERDUE)).toEqual([0, 1]);
  });

  it("isCustomerPaymentOverdue reads an LLM proxy 402 from a provider SDK error by code", () => {
    const body = { code: CUSTOMER_PAYMENT_OVERDUE, error: "payment overdue" };
    // The Anthropic SDK keeps the parsed body in `error`.
    expect(isCustomerPaymentOverdue({ status: 402, error: body })).toBe(true);
    expect(isCustomerPaymentOverdue({ status: 402, code: CUSTOMER_PAYMENT_OVERDUE })).toBe(true);
    expect(isCustomerPaymentOverdue({ status: 402, error: { code: "workspace_suspended" } })).toBe(false);
    expect(isCustomerPaymentOverdue({ status: 400, code: CUSTOMER_PAYMENT_OVERDUE })).toBe(false);
    expect(isCustomerPaymentOverdue(new NozleApiError("proxy", { status: 402, statusText: "Payment Required" }, { code: "card_required" }))).toBe(false);
  });
});

describe("NozleApiError message from an LLM proxy refusal", () => {
  it("reads the nested error.message of the provider-shaped body", () => {
    const error = new NozleApiError("proxy", { status: 402, statusText: "Payment Required" }, {
      code: "customer_payment_overdue",
      error: { message: "Payment overdue", type: "payment_required", code: "customer_payment_overdue" },
    });

    expect(error.message).toBe("proxy failed: 402 Payment Required: Payment overdue");
    expect(error.hasCode("customer_payment_overdue")).toBe(true);
  });
});
