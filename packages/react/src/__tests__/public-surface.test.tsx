import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  BillingProvider,
  FeatureGate,
  UsageGate,
  PlanGate,
  LockedOverlay,
  UpgradePrompt,
  UsageMeter,
  UsageDashboard,
  UsageAlert,
  PlanBadge,
  PaymentMethodDisplay,
  PlanComparison,
  PricingTable,
  getUsageMeterColor,
  usePlans,
  useNozleClient,
} from "../index";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("public presentation components", () => {
  it("gates feature access, loading, exact usage limits, and allowed plans", () => {
    const { rerender } = render(
      <FeatureGate allowed={false} fallback="Upgrade">
        Protected
      </FeatureGate>,
    );
    expect(screen.queryByText("Protected")).toBeNull();
    expect(screen.getByText("Upgrade")).toBeTruthy();
    rerender(
      <FeatureGate allowed loading>
        Protected
      </FeatureGate>,
    );
    expect(screen.queryByText("Protected")).toBeNull();
    rerender(<FeatureGate allowed>Protected</FeatureGate>);
    expect(screen.getByText("Protected")).toBeTruthy();
    rerender(
      <UsageGate usage={10} limit={10} fallback="At limit">
        Protected
      </UsageGate>,
    );
    expect(screen.getByText("At limit")).toBeTruthy();
    rerender(
      <UsageGate usage={9} limit={10}>
        Protected
      </UsageGate>,
    );
    expect(screen.getByText("Protected")).toBeTruthy();
    rerender(
      <PlanGate currentPlan="free" allowedPlans={["pro"]} fallback="Choose pro">
        Protected
      </PlanGate>,
    );
    expect(screen.getByText("Choose pro")).toBeTruthy();
    rerender(
      <PlanGate currentPlan="pro" allowedPlans={["pro"]}>
        Protected
      </PlanGate>,
    );
    expect(screen.getByText("Protected")).toBeTruthy();
  });
  it("unlocks content and invokes the merchant upgrade callback", () => {
    const onUpgrade = vi.fn();
    const { rerender } = render(
      <LockedOverlay locked onUpgrade={onUpgrade}>
        Protected
      </LockedOverlay>,
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Upgrade" }));
    expect(onUpgrade).toHaveBeenCalledTimes(1);
    rerender(<LockedOverlay locked={false}>Protected</LockedOverlay>);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Protected")).toBeTruthy();
    rerender(<UpgradePrompt planName="Pro" onUpgrade={onUpgrade} />);
    expect(
      screen.getByText("Upgrade to Pro to access this feature"),
    ).toBeTruthy();
  });
  it("renders usage thresholds, caps overage bars, and renders dashboard states", () => {
    expect(getUsageMeterColor(79)).toContain("primary");
    expect(getUsageMeterColor(80)).toContain("warning");
    expect(getUsageMeterColor(95)).toContain("destructive");
    const { container, rerender } = render(
      <UsageMeter used={120} limit={100} label="API requests" />,
    );
    expect(screen.getByText("120 / 100")).toBeTruthy();
    expect(container.querySelector('[style*="width: 100%"]')).toBeTruthy();
    rerender(<UsageMeter used={0} limit={0} label="Empty" />);
    expect(container.innerHTML).not.toContain("NaN");
    rerender(<UsageDashboard loading />);
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
    rerender(
      <UsageDashboard
        features={[{ key: "api", label: "API", used: 5, limit: 10 }]}
      />,
    );
    expect(screen.getByText("5 / 10")).toBeTruthy();
  });
  it("shows and dismisses only alerts at the threshold", () => {
    render(
      <UsageAlert
        features={[
          { key: "a", label: "API", percentage: 80 },
          { key: "b", label: "Seats", percentage: 79 },
        ]}
        upgradeHref="/billing"
      />,
    );
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(
      screen.getByRole("link", { name: "Upgrade" }).getAttribute("href"),
    ).toBe("/billing");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss API alert" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("renders payment details, empty state, update callback, and plan badges", () => {
    const update = vi.fn();
    const { rerender } = render(
      <PaymentMethodDisplay onUpdatePaymentMethod={update} />,
    );
    expect(screen.getByText("No payment method on file.")).toBeTruthy();
    rerender(
      <PaymentMethodDisplay
        paymentMethod={{
          brand: "visa",
          last4: "4242",
          expMonth: 3,
          expYear: 2030,
        }}
        onUpdatePaymentMethod={update}
      />,
    );
    expect(screen.getByText("Visa")).toBeTruthy();
    expect(screen.getByText("Expires 03/30")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Update Payment Method" }),
    );
    expect(update).toHaveBeenCalledOnce();
    rerender(<PlanBadge plan="Enterprise" tier="enterprise" />);
    expect(screen.getByText("Enterprise")).toBeTruthy();
  });
  it("compares what each catalog plan gives", () => {
    const base = { amount_currency: "USD", interval: "monthly" };
    render(
      <PlanComparison
        plans={[
          { ...base, code: "free", name: "Free", amount_cents: 0, entitlements: [{ feature_type: "metered", code: "seats", name: "Seats", usage_limit: 1 }] },
          {
            ...base,
            code: "pro",
            name: "Pro",
            amount_cents: 1000,
            entitlements: [
              { feature_type: "metered", code: "seats", name: "Seats", usage_limit: 10 },
              { feature_type: "boolean", code: "reports", name: "Reports" },
            ],
          },
        ]}
      />,
    );
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("10")).toBeTruthy();
    expect(screen.getByLabelText("Included")).toBeTruthy();
    expect(screen.getByLabelText("Not included")).toBeTruthy();
    expect(screen.getByText("$10 / month")).toBeTruthy();
  });
});

describe("public catalog hook", () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <BillingProvider publishableKey="pk_contract">{children}</BillingProvider>
  );
  it("loads the public catalog through the configured client", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            plans: [
              {
                code: "free",
                name: "Free",
                amount_cents: 0,
                amount_currency: "USD",
                interval: "monthly",
              },
            ],
          }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(
      () => ({ plans: usePlans(), client: useNozleClient() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.plans.isLoading).toBe(false));
    expect(result.current.plans.plans[0].code).toBe("free");
    expect(result.current.client.publishableKey).toBe("pk_contract");
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.nozle.app/engine/api/v1/plans",
    );
  });
  it("returns an error for a failed catalog request without an unhandled rejection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 503 })),
    );
    const { result } = renderHook(() => usePlans(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error?.message).toBe("HTTP 503");
  });
  it.each([
    ["an HTTP error", () => vi.fn().mockResolvedValue(new Response("{}", { status: 503 })), "HTTP 503"],
    ["a transport failure", () => vi.fn().mockRejectedValue(new TypeError("Failed to fetch")), "Failed to fetch"],
  ])("PricingTable shows %s from its own catalog request and never rejects unhandled", async (_name, makeFetch, message) => {
    vi.stubGlobal("fetch", makeFetch());
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    const onCheckoutError = vi.fn();
    render(
      <BillingProvider publishableKey="pk_contract">
        <PricingTable onCheckoutError={onCheckoutError} />
      </BillingProvider>,
    );
    expect((await screen.findByRole("alert")).textContent).toBe(`Plans could not be loaded: ${message}`);
    await new Promise((resolve) => setTimeout(resolve, 0));
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    expect(onCheckoutError).not.toHaveBeenCalled();
  });
  it("contains transport failures and ignores stale requests when the provider changes", async () => {
    let resolveOld!: (value: Response) => void;
    const old = new Promise<Response>((resolve) => {
      resolveOld = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockReturnValueOnce(old)
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ plans: [{ code: "new" }] })),
        ),
    );
    let current!: ReturnType<typeof usePlans>;
    function Probe() {
      current = usePlans();
      return null;
    }
    const { rerender } = render(
      <BillingProvider publishableKey="pk_old">
        <Probe />
      </BillingProvider>,
    );
    rerender(
      <BillingProvider publishableKey="pk_new">
        <Probe />
      </BillingProvider>,
    );
    await waitFor(() => expect(current.plans[0]?.code).toBe("new"));
    await act(async () =>
      resolveOld(new Response(JSON.stringify({ plans: [{ code: "old" }] }))),
    );
    expect(current.plans[0]?.code).toBe("new");
    expect(current.error).toBeNull();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Network unavailable")),
    );
    rerender(
      <BillingProvider publishableKey="pk_failed">
        <Probe />
      </BillingProvider>,
    );
    await waitFor(() =>
      expect(current.error?.message).toBe("Network unavailable"),
    );
    expect(current.plans).toEqual([]);
    expect(current.isLoading).toBe(false);
  });
});
