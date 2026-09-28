import { afterEach, describe, expect, it, vi } from "vitest";
import { Nozle } from "../index";
import type { SubscriptionTransitionParams } from "../index";

const params: SubscriptionTransitionParams = {
  customerId: "customer",
  subscriptionId: "external-subscription",
  operation: "cancel",
  timing: "end_of_period",
  expectedEffectiveAt: "2027-01-01T00:00:00.123456Z",
};
afterEach(() => vi.unstubAllGlobals());
describe("cancellation confirmation date", () => {
  it("forwards the exact preview timestamp, including microseconds", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ subscription_transition: {} })),
      );
    vi.stubGlobal("fetch", fetcher);
    await new Nozle({ apiKey: "sk_test" }).applySubscriptionTransition(
      params,
      "confirmation-1",
    );
    const options = fetcher.mock.calls[0][1];
    expect(JSON.parse(options.body).expected_effective_at).toBe(
      params.expectedEffectiveAt,
    );
    expect(options.headers["Idempotency-Key"]).toBe("confirmation-1");
  });
  it.each([
    { operation: "uncancel" },
    { operation: "downgrade", targetPlanCode: "lower" },
    { timing: "immediate" },
    { timing: undefined },
    { expectedEffectiveAt: "2027-01-01" },
    { expectedEffectiveAt: "2027-01-01T00:00:00" },
    { expectedEffectiveAt: "not-a-date" },
  ])("rejects invalid guard before network I/O: %j", async (invalid) => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(
      new Nozle({ apiKey: "sk_test" }).applySubscriptionTransition(
        { ...params, ...invalid } as SubscriptionTransitionParams,
        "confirmation-1",
      ),
    ).rejects.toThrow(/expectedEffectiveAt/);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
