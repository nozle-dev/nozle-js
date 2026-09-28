import { StrictMode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PlanChangeControl,
  type PlanChangeActions,
  type PlanChangeState,
} from "../components/portal/PlanChangeControl.js";
import { BillingPortalError } from "../components/portal/client.js";
import {
  formatBillingDate,
  formatMinorAmount,
} from "../components/billing/amounts.js";

vi.mock("../components/billing/Checkout.js", () => ({
  Checkout: (props: any) => (
    <button onClick={() => props.onComplete()}>Resume test payment</button>
  ),
}));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
const pro = {
  code: "pro",
  name: "Pro",
  amountCents: "5000",
  currency: "USD",
  interval: "monthly",
};
const starter = {
  ...pro,
  code: "starter",
  name: "Starter",
  amountCents: "1000",
};
const business = {
  ...pro,
  code: "business",
  name: "Business",
  amountCents: "10000",
};
const effectiveAt = "2026-10-01T00:00:00.123456Z";
function fixture() {
  let state: PlanChangeState = {
    subscriptionId: "external-sub",
    status: "active",
    currentPlan: pro,
    endingAt: null,
    pendingChange: null,
    eligiblePlans: [
      { ...starter, operation: "downgrade" },
      { ...business, operation: "upgrade" },
    ],
    blockedReason: null,
    checkout: null,
    checkoutStatus: "none",
  };
  const actions = {
    load: vi.fn(async () => structuredClone(state)),
    status: vi.fn(async () => structuredClone(state)),
    preview: vi.fn(async ({ targetPlanCode }) => ({
      operation: targetPlanCode === "starter" ? "downgrade" : "upgrade",
      timing: targetPlanCode === "starter" ? "end_of_period" : "immediate",
      currency: "USD",
      creditAmountCents: "0",
      debitAmountCents: "1000",
      netAmountCents: "1000",
      amountDueNowCents: targetPlanCode === "starter" ? "0" : "1000",
      amountDueAtEffectiveCents: targetPlanCode === "starter" ? "1000" : "0",
      effectiveAt,
      renewalAt: effectiveAt,
      quoteToken: "signed-server-quote",
    })),
    apply: vi.fn(async ({ targetPlanCode }) => {
      if (targetPlanCode === "starter") {
        state = {
          ...state,
          pendingChange: { id: "pending-one", plan: starter, effectiveAt },
        };
        return {
          type: "scheduled",
          status: "pending",
          effective_at: effectiveAt,
        };
      }
      state = {
        ...state,
        checkoutStatus: "processing",
        checkout: {
          type: "processing",
          checkout_id: "checkout-one",
          status: "processing",
        },
      };
      return state.checkout!;
    }),
    withdraw: vi.fn(async () => {
      state = { ...state, pendingChange: null };
    }),
  } satisfies Record<keyof PlanChangeActions, unknown> | object;
  const changed = vi.fn();
  return {
    actions: actions as typeof actions & PlanChangeActions,
    changed,
    get: () => state,
    set: (patch: Partial<PlanChangeState>) => {
      state = { ...state, ...patch };
    },
    mount: () =>
      render(
        <PlanChangeControl
          subscriptionId="external-sub"
          actions={actions as PlanChangeActions}
          onChanged={changed}
        />,
      ),
  };
}
async function choose(code: string) {
  fireEvent.click(await screen.findByRole("button", { name: "Change plan" }));
  await waitFor(() =>
    expect((screen.getByRole("combobox") as HTMLSelectElement).disabled).toBe(
      false,
    ),
  );
  fireEvent.change(screen.getByRole("combobox"), { target: { value: code } });
  fireEvent.click(screen.getByRole("button", { name: "Review change" }));
  await screen.findByRole("button", {
    name: code === "starter" ? "Confirm downgrade" : "Confirm upgrade",
  });
}
describe("subscription plan changes", () => {
  it("refreshes when cancellation or Keep changes the same subscription", async () => {
    const f = fixture();
    const view = render(
      <PlanChangeControl
        subscriptionId="external-sub"
        actions={f.actions}
        refreshKey="renewing"
      />,
    );
    await screen.findByRole("button", { name: "Change plan" });
    f.set({ endingAt: effectiveAt });
    view.rerender(
      <PlanChangeControl
        subscriptionId="external-sub"
        actions={f.actions}
        refreshKey="canceling"
      />,
    );
    await screen.findByText(
      "Keep your subscription before choosing another plan.",
    );
    expect(screen.queryByRole("button", { name: "Change plan" })).toBeNull();
    f.set({ endingAt: null });
    view.rerender(
      <PlanChangeControl
        subscriptionId="external-sub"
        actions={f.actions}
        refreshKey="renewing-again"
      />,
    );
    await screen.findByRole("button", { name: "Change plan" });
  });
  it("confirms and persists a quoted downgrade, then withdraws only that pending change", async () => {
    const f = fixture();
    f.mount();
    await choose("starter");
    expect(f.actions.apply).not.toHaveBeenCalled();
    expect(screen.getByText("Due now").nextElementSibling?.textContent).toBe(
      "$0.00",
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm downgrade" }));
    await screen.findByRole("button", { name: "Keep current plan" });
    expect(f.actions.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionId: "external-sub",
        targetPlanCode: "starter",
        quoteToken: "signed-server-quote",
        idempotencyKey: expect.any(String),
      }),
    );
    expect(f.get().currentPlan.code).toBe("pro");
    fireEvent.click(screen.getByRole("button", { name: "Keep current plan" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm keep current plan" }),
    );
    await screen.findByText(
      "Scheduled change removed. Your current plan will continue to renew.",
    );
    expect(f.actions.withdraw).toHaveBeenCalledWith(
      expect.objectContaining({
        pendingChangeId: "pending-one",
        subscriptionId: "external-sub",
      }),
    );
    expect(f.get().currentPlan.code).toBe("pro");
  });
  it("does not call a checkout result an active upgrade until persisted state confirms it", async () => {
    const f = fixture();
    f.mount();
    await choose("business");
    fireEvent.click(screen.getByRole("button", { name: "Confirm upgrade" }));
    await screen.findByText(
      "Your change is processing. Your current plan remains active until confirmation.",
    );
    expect(f.changed).not.toHaveBeenCalled();
    expect(screen.queryByText("Your Business plan is active.")).toBeNull();
    f.set({
      currentPlan: business,
      checkoutStatus: "succeeded",
      checkout: null,
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Check subscription status" }),
    );
    await screen.findByText("Your Business plan is active.");
    expect(f.actions.apply).toHaveBeenCalledTimes(1);
    expect(f.changed).toHaveBeenCalledTimes(1);
  });
  it("resumes a persisted payment after reload without starting a second checkout", async () => {
    const f = fixture();
    f.set({
      checkoutStatus: "awaiting_payment",
      checkout: { type: "stripe", url: "https://checkout.example/test" },
    });
    f.mount();
    await screen.findByRole("button", { name: "Resume test payment" });
    expect(screen.queryByRole("button", { name: "Change plan" })).toBeNull();
    f.set({
      currentPlan: business,
      checkoutStatus: "succeeded",
      checkout: null,
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Resume test payment" }),
    );
    await screen.findByText("Your Business plan is active.");
    expect(f.actions.apply).not.toHaveBeenCalled();
    expect(f.changed).toHaveBeenCalledOnce();
  });
  it("reconciles a lost accepted response without applying again", async () => {
    const f = fixture();
    f.actions.apply.mockImplementationOnce(async () => {
      f.set({
        pendingChange: { id: "pending-one", plan: starter, effectiveAt },
      });
      throw new Error("lost response");
    });
    f.mount();
    await choose("starter");
    fireEvent.click(screen.getByRole("button", { name: "Confirm downgrade" }));
    await screen.findByRole("button", { name: "Keep current plan" });
    expect(f.actions.apply).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("preserves an uncertain request key across closing and retrying", async () => {
    const f = fixture();
    f.actions.apply.mockRejectedValueOnce(new Error("network"));
    f.mount();
    await choose("starter");
    fireEvent.click(screen.getByRole("button", { name: "Confirm downgrade" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Review and retry change" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Check status / retry" }),
    );
    await screen.findByRole("button", { name: "Keep current plan" });
    expect(f.actions.apply.mock.calls[0][0].idempotencyKey).toBe(
      f.actions.apply.mock.calls[1][0].idempotencyKey,
    );
  });
  it("requires a fresh quote after a changed price and shows current backend state", async () => {
    const f = fixture();
    f.actions.apply.mockImplementationOnce(async () => {
      f.set({ endingAt: effectiveAt, eligiblePlans: [] });
      throw new BillingPortalError("changed");
    });
    f.mount();
    await choose("business");
    fireEvent.click(screen.getByRole("button", { name: "Confirm upgrade" }));
    await screen.findByText(
      "Your subscription or price changed. Check the latest details and confirm again.",
    );
    expect(
      screen.getByText("Keep your subscription before choosing another plan."),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Confirm upgrade" }),
    ).toBeNull();
  });
  it("submits the pending ID the customer saw even if another downgrade replaced it", async () => {
    const f = fixture();
    f.set({ pendingChange: { id: "pending-one", plan: starter, effectiveAt } });
    f.actions.withdraw.mockRejectedValueOnce(new BillingPortalError("changed"));
    f.mount();
    fireEvent.click(
      await screen.findByRole("button", { name: "Keep current plan" }),
    );
    f.set({
      pendingChange: { id: "pending-new", plan: business, effectiveAt },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm keep current plan" }),
    );
    await screen.findByRole("alert");
    expect(f.actions.withdraw).toHaveBeenCalledWith(
      expect.objectContaining({ pendingChangeId: "pending-one" }),
    );
    expect(f.get().pendingChange?.id).toBe("pending-new");
  });
  it("keeps the current plan after payment fails and permits a new confirmed choice", async () => {
    const f = fixture();
    f.set({ checkoutStatus: "failed" });
    f.mount();
    await screen.findByText(
      "Payment did not complete. Your current plan is unchanged.",
    );
    expect(screen.getByRole("button", { name: "Change plan" })).toBeTruthy();
    expect(f.get().currentPlan.code).toBe("pro");
  });
  it("uses policy eligibility instead of inferring upgrades from displayed price", async () => {
    const f = fixture();
    f.set({
      eligiblePlans: [
        { ...business, amountCents: "100", operation: "downgrade" },
      ],
    });
    f.mount();
    fireEvent.click(await screen.findByRole("button", { name: "Change plan" }));
    expect(
      await screen.findByRole("option", {
        name: "Business — $1.00 / monthly (downgrade)",
      }),
    ).toBeTruthy();
  });
  it("does not enable confirmation of an unusable monetary quote", async () => {
    const f = fixture();
    f.actions.preview.mockResolvedValueOnce({
      operation: "upgrade",
      timing: "immediate",
      currency: "USD",
      creditAmountCents: "0",
      debitAmountCents: "100",
      netAmountCents: "100",
      amountDueNowCents: 9007199254740992,
      amountDueAtEffectiveCents: "0",
      effectiveAt,
      renewalAt: effectiveAt,
      quoteToken: "invalid-amount-quote",
    } as any);
    f.mount();
    fireEvent.click(await screen.findByRole("button", { name: "Change plan" }));
    await waitFor(() =>
      expect((screen.getByRole("combobox") as HTMLSelectElement).disabled).toBe(
        false,
      ),
    );
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "business" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review change" }));
    await screen.findByRole("alert");
    expect(
      screen.queryByRole("button", { name: "Confirm upgrade" }),
    ).toBeNull();
    expect(f.actions.apply).not.toHaveBeenCalled();
  });
  it("ignores a previous customer's late response and resets dialogs", async () => {
    const f = fixture();
    const first = f.mount();
    await choose("starter");
    const next = fixture();
    next.set({ currentPlan: business, eligiblePlans: [] });
    first.rerender(
      <PlanChangeControl
        subscriptionId="external-sub"
        actions={next.actions}
      />,
    );
    await screen.findByText(
      "No other plans are available for this subscription.",
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(next.actions.apply).not.toHaveBeenCalled();
  });
  it("works under StrictMode and traps and restores confirmation focus", async () => {
    const f = fixture();
    render(
      <StrictMode>
        <PlanChangeControl subscriptionId="external-sub" actions={f.actions} />
      </StrictMode>,
    );
    const trigger = await screen.findByRole("button", { name: "Change plan" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
    await waitFor(() =>
      expect(
        (
          within(dialog).getByRole("button", {
            name: "Close",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
  it("releases a stalled apply and reconciles before its retry", async () => {
    const f = fixture();
    f.actions.apply.mockImplementationOnce(() => new Promise(() => {}));
    f.mount();
    await choose("starter");
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Confirm downgrade" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30001);
    });
    expect(
      screen.getByText(
        "This request timed out. Check subscription status before retrying.",
      ),
    ).toBeTruthy();
    vi.useRealTimers();
    f.set({ pendingChange: { id: "pending-one", plan: starter, effectiveAt } });
    fireEvent.click(
      screen.getByRole("button", { name: "Check status / retry" }),
    );
    await screen.findByRole("button", { name: "Keep current plan" });
    expect(f.actions.apply).toHaveBeenCalledOnce();
  });
});
describe("billing display", () => {
  it("formats supported currency minor units without precision loss", () => {
    expect(formatMinorAmount("1234", "JPY")).toBe("¥1,234");
    expect(formatMinorAmount("1234", "KWD")).toContain("1.234");
    expect(formatMinorAmount("900719925474099301", "USD")).toBe(
      "$9,007,199,254,740,993.01",
    );
    expect(formatMinorAmount("-1", "USD")).toBe("-$0.01");
    expect(formatMinorAmount(9007199254740992, "USD")).toBe(
      "Amount unavailable",
    );
  });
  it("uses customer timezones including GraphQL enums", () => {
    expect(
      formatBillingDate(
        "2026-10-01T00:00:00Z",
        "en-US",
        "TZ_AMERICA_LOS_ANGELES",
      ),
    ).toBe("Sep 30, 2026");
  });
});
