import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { BillingProvider, CurrentPlan, currentPlanMeters } from "../index.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const plan = { code: "pro", name: "Pro", amount_cents: 2900, currency: "USD", interval: "monthly" };
const active = {
  subscription: { external_id: "sub_1", plan_code: "pro", status: "active", ending_at: null, plan },
  pending_change: null,
};

describe("CurrentPlan from props", () => {
  it("shows the plan, its status, price and meters", () => {
    render(<CurrentPlan subscription={active} usage={[{ key: "events", label: "Events", used: 300, limit: 1000 }]} />);
    expect(screen.getByText("Pro")).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText("$29 / month")).toBeTruthy();
    expect(screen.getByText("300 / 1,000")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("warns when a meter reaches the warning percentage", () => {
    render(<CurrentPlan subscription={active} usage={[{ key: "events", label: "events", used: 900, limit: 1000 }]} />);
    expect(screen.getByRole("status").textContent).toBe("You have used 90% of the events included in Pro.");
  });

  it("shows a scheduled change and an end date", () => {
    render(
      <CurrentPlan
        subscription={{
          subscription: { ...active.subscription, ending_at: "2026-11-01T00:00:00Z" },
          pending_change: { plan_code: "free", name: "Free", effective_at: "2026-11-01T00:00:00Z" },
        }}
      />,
    );
    expect(screen.getByText("Ends Nov 1, 2026")).toBeTruthy();
    expect(screen.getByText("Changes to Free on Nov 1, 2026")).toBeTruthy();
  });

  it("shows a past-due alert", () => {
    render(<CurrentPlan subscription={{ ...active, past_due: true }} />);
    expect(screen.getByRole("alert").textContent).toBe("A payment is overdue. Pay the open invoice to keep your plan active.");
  });

  it("shows the empty message without a subscription", () => {
    render(<CurrentPlan subscription={{ subscription: null, pending_change: null }} />);
    expect(screen.getByRole("status").textContent).toBe("No active plan.");
  });
});

describe("currentPlanMeters", () => {
  it("joins metered limits with this period's units by feature code", () => {
    const meters = currentPlanMeters(
      [
        { feature_type: "metered", code: "events", name: "Events", usage_limit: 1000 },
        { feature_type: "boolean", code: "sso", name: "SSO" },
        { feature_type: "metered", code: "seats", name: "Seats", usage_limit: null },
      ],
      {
        from_datetime: "", to_datetime: "", currency: "USD", amount_cents: 0,
        charges_usage: [
          { units: "120", amount_cents: 0, amount_currency: "USD", charge: { nozle_id: "c1", charge_model: "standard" }, feature: { nozle_id: "f1", code: "events", name: "Events" } },
          { units: "30.5", amount_cents: 0, amount_currency: "USD", charge: { nozle_id: "c2", charge_model: "standard" }, feature: { nozle_id: "f1", code: "events", name: "Events" } },
        ],
      },
    );
    expect(meters).toEqual([
      { key: "events", label: "Events", used: 150.5, limit: 1000 },
      { key: "seats", label: "Seats", used: 0, limit: null },
    ]);
  });
});

describe("currentPlanMeters for another version", () => {
  it("keeps the usage but not the limits", () => {
    const meters = currentPlanMeters([{ feature_type: "metered", code: "events", name: "Events", usage_limit: 1000 }], null, false);
    expect(meters).toEqual([{ key: "events", label: "Events", used: 0, limit: null }]);
  });
});

describe("CurrentPlan from the backend", () => {
  it("reads the subscription, the plan's limits and this period's usage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), "https://app.example");
        if (url.pathname.endsWith("/api/v1/plans")) {
          return Response.json({ plans: [{ ...plan, amount_currency: "USD", entitlements: [{ feature_type: "metered", code: "events", name: "Events", usage_limit: 1000 }] }] });
        }
        const route = url.pathname.split("/").pop();
        if (route === "subscription") return Response.json(active);
        if (route === "usage") {
          return Response.json({
            usage: { charges_usage: [{ units: "250", feature: { code: "events", name: "Events" } }] },
          });
        }
        return Response.json({}, { status: 404 });
      }),
    );
    render(
      <BillingProvider publishableKey="pk_test" billingEndpoint="/api/nozle">
        <CurrentPlan />
      </BillingProvider>,
    );
    expect(await screen.findByText("250 / 1,000")).toBeTruthy();
    expect(screen.getByText("Events used this period")).toBeTruthy();
  });

  it("does not show the current version's limits to a customer on an older version", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), "https://app.example");
        if (url.pathname.endsWith("/api/v1/plans")) {
          return Response.json({ plans: [{ ...plan, amount_currency: "USD", version: 2, is_current: true, entitlements: [{ feature_type: "metered", code: "events", name: "Events", usage_limit: 1000 }] }] });
        }
        const route = url.pathname.split("/").pop();
        if (route === "subscription") return Response.json({ ...active, subscription: { ...active.subscription, plan_version: 1 } });
        if (route === "usage") return Response.json({ usage: { charges_usage: [{ units: "250", feature: { code: "events", name: "Events" } }] } });
        return Response.json({}, { status: 404 });
      }),
    );
    render(
      <BillingProvider publishableKey="pk_test" billingEndpoint="/api/nozle">
        <CurrentPlan />
      </BillingProvider>,
    );
    expect(await screen.findByText("Events used this period")).toBeTruthy();
    expect(screen.queryByText("250 / 1,000")).toBeNull();
    expect(screen.queryByText(/1,000/)).toBeNull();
  });

  it("shows an older version's own limits when the billing handler sends them", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), "https://app.example");
        if (url.pathname.endsWith("/api/v1/plans")) {
          return Response.json({ plans: [{ ...plan, amount_currency: "USD", version: 2, is_current: true, entitlements: [{ feature_type: "metered", code: "events", name: "Events", usage_limit: 2000 }] }] });
        }
        const route = url.pathname.split("/").pop();
        if (route === "subscription") {
          return Response.json({ ...active, subscription: { ...active.subscription, plan_version: 1, entitlements: [{ feature_type: "metered", code: "events", name: "Events", usage_limit: 1000 }] } });
        }
        if (route === "usage") return Response.json({ usage: { charges_usage: [{ units: "250", feature: { code: "events", name: "Events" } }] } });
        return Response.json({}, { status: 404 });
      }),
    );
    render(
      <BillingProvider publishableKey="pk_test" billingEndpoint="/api/nozle">
        <CurrentPlan />
      </BillingProvider>,
    );
    expect(await screen.findByText("250 / 1,000")).toBeTruthy();
    expect(screen.queryByText(/2,000/)).toBeNull();
  });
});
