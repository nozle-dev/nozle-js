import {
  useCheckoutSession,
  usePlan,
  usePlans,
  useSubscribe,
  type ScheduledCheckoutResult,
  type UseCheckoutSessionResult,
  type UseSubscribeResult,
} from "../index";

import { describe, expect, it } from "vitest";

describe("documented React exports", () => {
  it("compile and remain available during the direct-subscribe migration", () => {
    const checkoutHook: () => UseCheckoutSessionResult = useCheckoutSession;
    const subscribeHook: () => UseSubscribeResult = useSubscribe;
    const scheduled: ScheduledCheckoutResult = {
      type: "scheduled",
      status: "pending",
    };

    expect(checkoutHook).toBeTypeOf("function");
    expect(subscribeHook).toBeTypeOf("function");
    expect(usePlan).toBeTypeOf("function");
    expect(usePlans).toBeTypeOf("function");
    expect(scheduled.type).toBe("scheduled");
  });
});
