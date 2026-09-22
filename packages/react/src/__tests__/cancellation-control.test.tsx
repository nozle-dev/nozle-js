import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CancellationControl,
  type CancellationActions,
  type CancellationSubscription,
} from "../components/portal/CancellationControl.js";
import { BillingPortalError } from "../components/portal/client.js";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
const end = "2099-10-17T18:30:00Z";
const initial: CancellationSubscription = {
  id: "internal-uuid",
  externalId: "merchant-subscription",
  name: "Pro",
  status: "active",
  endingAt: null,
};
function setup(
  options: {
    state?: CancellationSubscription;
    apply?: CancellationActions["apply"];
    preview?: CancellationActions["preview"];
  } = {},
) {
  let state = options.state ?? { ...initial };
  const refresh = vi.fn(async () => state);
  const actions: CancellationActions = {
    preview: vi.fn(
      options.preview ??
        (async ({ operation }) => ({
          operation,
          effectiveAt: end,
          renewalAt: end,
        })),
    ),
    apply: vi.fn(
      options.apply ??
        (async ({ operation }) => {
          state = {
            ...state,
            endingAt: operation === "cancel" ? end : null,
            pendingPlanName: null,
          };
        }),
    ),
  };
  const onChanged = vi.fn();
  const onError = vi.fn();
  const props = {
    subscription: state,
    actions,
    refresh,
    onChanged,
    onError,
    timezone: "Asia/Kolkata",
  };
  const view = render(<CancellationControl {...props} />);
  return {
    ...view,
    props,
    actions,
    refresh,
    onChanged,
    onError,
    setState: (next: CancellationSubscription) => {
      state = next;
    },
  };
}

describe("CancellationControl", () => {
  it("previews the external ID and confirms cancellation only after an explicit click and persisted read", async () => {
    const test = setup({ state: { ...initial, pendingPlanName: "Basic" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Cancel subscription" }),
    );
    await screen.findByText("October 18, 2099");
    expect(screen.getByText(/scheduled change to Basic/)).toBeTruthy();
    expect(test.actions.apply).not.toHaveBeenCalled();
    expect(test.actions.preview).toHaveBeenCalledWith({
      subscriptionId: "merchant-subscription",
      operation: "cancel",
      signal: expect.any(AbortSignal),
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm cancellation" }),
    );
    await screen.findByText("Cancellation scheduled.");
    expect(test.actions.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionId: "merchant-subscription",
        operation: "cancel",
        expectedEffectiveAt: end,
        idempotencyKey: expect.any(String),
      }),
    );
    expect(test.refresh).toHaveBeenCalledTimes(2);
    expect(test.onChanged).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("button", { name: "Keep my subscription" }),
    ).toBeTruthy();
  });

  it("keeps a subscription without recreating a previously removed plan change", async () => {
    const test = setup({ state: { ...initial, endingAt: end } });
    fireEvent.click(
      screen.getByRole("button", { name: "Keep my subscription" }),
    );
    await screen.findByText(/current plan will continue to renew/);
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm keep subscription" }),
    );
    await screen.findByText("Your subscription will continue to renew.");
    expect(test.actions.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "uncancel",
        expectedEffectiveAt: undefined,
      }),
    );
    expect(
      screen.getByRole("button", { name: "Cancel subscription" }),
    ).toBeTruthy();
  });

  it("reconciles a lost success response without a second mutation", async () => {
    const test = setup();
    vi.mocked(test.actions.apply).mockImplementation(async () => {
      test.setState({ ...initial, endingAt: end });
      throw new Error("secret upstream body");
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Cancel subscription" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Confirm cancellation" }),
    );
    await screen.findByText("Cancellation scheduled.");
    expect(test.actions.apply).toHaveBeenCalledOnce();
    expect(screen.queryByText(/secret upstream/)).toBeNull();
  });

  it("retains the same request key when retrying an uncertain attempt, including after closing", async () => {
    const test = setup({
      apply: async () => {
        throw new Error("network lost");
      },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Cancel subscription" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Confirm cancellation" }),
    );
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Cancel subscription" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Check status / retry" }),
    );
    await waitFor(() => expect(test.actions.apply).toHaveBeenCalledTimes(2));
    const calls = vi.mocked(test.actions.apply).mock.calls;
    expect(calls[0][0].idempotencyKey).toBe(calls[1][0].idempotencyKey);
    expect(test.actions.preview).toHaveBeenCalledOnce();
  });

  it("checks persisted state before retry and never repeats an accepted mutation", async () => {
    const test = setup({ apply: async () => {} });
    fireEvent.click(
      screen.getByRole("button", { name: "Cancel subscription" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Confirm cancellation" }),
    );
    await screen.findByRole("alert");
    test.setState({ ...initial, endingAt: end });
    fireEvent.click(
      screen.getByRole("button", { name: "Check status / retry" }),
    );
    await screen.findByText("Cancellation scheduled.");
    expect(test.actions.apply).toHaveBeenCalledOnce();
  });

  it("requires a new preview when the merchant rejects a changed quote", async () => {
    const test = setup({
      apply: async () => {
        throw new BillingPortalError("changed");
      },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Cancel subscription" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Confirm cancellation" }),
    );
    await screen.findByText(/Review its latest details/);
    expect(test.refresh).toHaveBeenCalledTimes(2);
    expect(
      screen.queryByRole("button", { name: "Confirm cancellation" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("button", { name: "Confirm cancellation" });
    expect(test.actions.preview).toHaveBeenCalledTimes(2);
  });

  it("unlocks a stalled merchant callback and reconciles before retrying", async () => {
    const test = setup({ apply: () => new Promise(() => {}) });
    fireEvent.click(
      screen.getByRole("button", { name: "Cancel subscription" }),
    );
    const confirm = await screen.findByRole("button", {
      name: "Confirm cancellation",
    });
    vi.useFakeTimers();
    fireEvent.click(confirm);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_001);
    });
    expect(screen.getByRole("alert").textContent).toContain("timed out");
    expect(
      (screen.getByRole("button", { name: "Close" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    expect(vi.mocked(test.actions.apply).mock.calls[0][0].signal.aborted).toBe(
      true,
    );
    vi.useRealTimers();
    test.setState({ ...initial, endingAt: end });
    fireEvent.click(
      screen.getByRole("button", { name: "Check status / retry" }),
    );
    await screen.findByText("Cancellation scheduled.");
    expect(test.actions.apply).toHaveBeenCalledOnce();
  });

  it("prevents duplicate submissions and aborts when the selected subscription changes", async () => {
    let settle: () => void = () => {};
    let signal: AbortSignal | undefined;
    const test = setup({
      apply: async (input) => {
        signal = input.signal;
        await new Promise<void>((resolve) => {
          settle = resolve;
        });
      },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Cancel subscription" }),
    );
    const button = await screen.findByRole("button", {
      name: "Confirm cancellation",
    });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(test.actions.apply).toHaveBeenCalledOnce();
    test.rerender(
      <CancellationControl
        {...test.props}
        subscription={{
          ...initial,
          id: "new-internal",
          externalId: "new-external",
          name: "Other subscription",
        }}
      />,
    );
    expect(signal?.aborted).toBe(true);
    await act(async () => settle());
    expect(test.onChanged).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("focuses the modal, traps tab, and restores focus when dismissed", async () => {
    setup();
    const trigger = screen.getByRole("button", { name: "Cancel subscription" });
    fireEvent.click(trigger);
    await screen.findByRole("button", { name: "Confirm cancellation" });
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab" });
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Close" }),
    );
    fireEvent.keyDown(screen.getByRole("dialog"), {
      key: "Tab",
      shiftKey: true,
    });
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Confirm cancellation" }),
    );
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("does not offer Keep after the ending boundary or cancellation on ended subscriptions", () => {
    const test = setup({
      state: { ...initial, endingAt: "2000-01-01T00:00:00Z" },
    });
    expect(screen.queryByRole("button")).toBeNull();
    test.rerender(
      <CancellationControl
        {...test.props}
        subscription={{ ...initial, status: "terminated" }}
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("rejects a mismatched preview and redacts backend failures", async () => {
    setup({
      preview: async () => ({
        operation: "uncancel",
        effectiveAt: end,
        renewalAt: null,
      }),
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Cancel subscription" }),
    );
    await screen.findByRole("alert");
    expect(
      screen.queryByRole("button", { name: "Confirm cancellation" }),
    ).toBeNull();
  });
});
