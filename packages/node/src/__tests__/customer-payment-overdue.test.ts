import { afterEach, describe, expect, it, vi } from "vitest";
import { Nozle } from "../client";
import { CUSTOMER_PAYMENT_OVERDUE, NozleApiError } from "../index";

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

  it("refusedEventIndexes lists the refused events of a batch", () => {
    const error = new NozleApiError("events batch", { status: 402, statusText: "Payment Required" }, {
      status: 402,
      code: CUSTOMER_PAYMENT_OVERDUE,
      error: "payment overdue",
      error_details: {
        "3": { external_customer_id: [CUSTOMER_PAYMENT_OVERDUE] },
        "0": { external_customer_id: [CUSTOMER_PAYMENT_OVERDUE] },
        "1": { code: ["value_is_mandatory"] },
      },
    });
    expect(error.hasCode(CUSTOMER_PAYMENT_OVERDUE)).toBe(true);
    expect(error.refusedEventIndexes(CUSTOMER_PAYMENT_OVERDUE)).toEqual([0, 3]);
    expect(new NozleApiError("track", { status: 402, statusText: "Payment Required" }, {}).refusedEventIndexes(CUSTOMER_PAYMENT_OVERDUE)).toEqual([]);
  });
});
