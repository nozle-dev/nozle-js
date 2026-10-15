import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { UsageBreakdown, UsageTrend, type CustomerUsageData } from "../index";

afterEach(cleanup);

const charge = (id: string, code: string, name: string, units: string, amount_cents: number) => ({
  units,
  amount_cents,
  amount_currency: "USD",
  charge: { nozle_id: id, charge_model: "standard" },
  feature: { nozle_id: `f-${id}`, code, name },
});
const period = (from: string, charges: ReturnType<typeof charge>[]): CustomerUsageData => ({
  from_datetime: `${from}T00:00:00Z`,
  to_datetime: `${from.slice(0, 8)}28T23:59:59Z`,
  currency: "USD",
  amount_cents: charges.reduce((sum, c) => sum + c.amount_cents, 0),
  charges_usage: charges,
});

describe("UsageBreakdown", () => {
  const usage = period("2026-10-01", [
    charge("c1", "emails", "Emails", "1200.0", 1200),
    charge("c2", "sms", "SMS", "30", 4500),
  ]);

  it("lists each feature's units and amount, largest first, with the total", () => {
    render(<UsageBreakdown usage={usage} />);
    const names = screen.getAllByRole("row").map((row) => row.textContent);
    expect(names[1]).toContain("SMS");
    expect(names[2]).toContain("Emails");
    expect(screen.getByText("1,200")).toBeTruthy();
    expect(screen.getByText("$57.00")).toBeTruthy();
    expect(screen.getByText(/Oct 1, 2026 to Oct 28, 2026/)).toBeTruthy();
  });

  it("shows loading, error and empty states", () => {
    const { rerender } = render(<UsageBreakdown isLoading />);
    expect(screen.getByLabelText("Loading usage")).toBeTruthy();
    rerender(<UsageBreakdown error="Usage unavailable" />);
    expect(screen.getByRole("alert").textContent).toBe("Usage unavailable");
    rerender(<UsageBreakdown usage={{ ...usage, charges_usage: [] }} />);
    expect(screen.getByRole("status").textContent).toBe("No usage in this period yet.");
  });
});

describe("UsageTrend", () => {
  const periods = [
    period("2026-09-01", [charge("c1", "emails", "Emails", "500", 500)]),
    period("2026-08-01", [charge("c1", "emails", "Emails", "250", 250), charge("c2", "sms", "SMS", "5", 100)]),
  ];

  it("draws one bar per period, oldest first, with the amount", () => {
    render(<UsageTrend periods={periods} />);
    const bars = screen.getAllByRole("img").map((bar) => bar.getAttribute("aria-label"));
    expect(bars).toEqual(["Aug 1, 2026: $3.50", "Sep 1, 2026: $5.00"]);
  });

  it("charts the units of one feature, zero where a period lacks it", () => {
    render(<UsageTrend periods={[...periods, period("2026-10-01", [charge("c2", "sms", "SMS", "9", 10)])]} featureCode="emails" />);
    const bars = screen.getAllByRole("img").map((bar) => bar.getAttribute("aria-label"));
    expect(bars).toEqual(["Aug 1, 2026: 250 emails", "Sep 1, 2026: 500 emails", "Oct 1, 2026: 0 emails"]);
  });

  it("shows loading, error and empty states", () => {
    const { rerender } = render(<UsageTrend isLoading />);
    expect(screen.getByLabelText("Loading usage trend")).toBeTruthy();
    rerender(<UsageTrend error={new Error("History unavailable")} />);
    expect(screen.getByRole("alert").textContent).toBe("History unavailable");
    rerender(<UsageTrend periods={[]} />);
    expect(screen.getByRole("status").textContent).toBe("No past usage yet.");
  });
});
