import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CreditBalance, CreditHistory, UsageDashboard, UsageMeter, usageItems } from "../index";

afterEach(cleanup);

describe("usageItems", () => {
  it("joins metered entitlements with usage results and keeps unlimited as null", () => {
    expect(
      usageItems(
        [
          { feature_type: "metered", code: "api", name: "API calls" },
          { feature_type: "metered", code: "seats", name: "Seats" },
          { feature_type: "boolean", code: "sso", name: "SSO" },
          { feature_type: "metered", code: "no_result", name: "No result" },
        ],
        { api: { used: 5, limit: 10 }, seats: { used: 2 }, sso: { used: 0 } },
      ),
    ).toEqual([
      { key: "api", label: "API calls", used: 5, limit: 10 },
      { key: "seats", label: "Seats", used: 2, limit: null },
    ]);
  });
});

describe("usage components", () => {
  it("shows Unlimited for a feature without a limit", () => {
    render(<UsageMeter used={1200} limit={null} label="Seats" />);
    expect(screen.getByText("1,200 / Unlimited")).toBeTruthy();
  });

  it("shows error, empty and loading states", () => {
    const { rerender } = render(<UsageDashboard error="Usage could not be loaded" />);
    expect(screen.getByRole("alert").textContent).toBe("Usage could not be loaded");
    rerender(<UsageDashboard features={[]} />);
    expect(screen.getByRole("status").textContent).toBe("No usage to show yet.");
    rerender(<UsageDashboard loading />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("CreditBalance", () => {
  const balance = {
    credit_system_name: "AI credits",
    unit_name: "credit",
    available: "1500.5",
    as_of: "2026-10-15T10:00:00Z",
    sources: [
      { id: "s1", type: "subscription_grant" as const, remaining: "1000", expires_at: "2026-11-01T00:00:00Z" },
      { id: "s2", type: "top_up" as const, remaining: "500.5", expires_at: null },
      { id: "s3", type: "manual_grant" as const, remaining: "0", expires_at: null },
    ],
  };

  it("shows the available credits and where they come from", () => {
    render(<CreditBalance balance={balance} />);
    expect(screen.getByText("1,500.5")).toBeTruthy();
    expect(screen.getByText(/credits available/)).toBeTruthy();
    expect(screen.getByText("Plan grant")).toBeTruthy();
    expect(screen.getByText("Top-up")).toBeTruthy();
    expect(screen.queryByText("Granted")).toBeNull();
  });

  it("shows loading, error and empty states", () => {
    const { rerender } = render(<CreditBalance isLoading />);
    expect(screen.getByLabelText("Loading credit balance")).toBeTruthy();
    rerender(<CreditBalance error={new Error("Balance unavailable")} />);
    expect(screen.getByRole("alert").textContent).toBe("Balance unavailable");
    rerender(<CreditBalance balance={null} />);
    expect(screen.getByRole("status").textContent).toBe("No credit balance yet.");
  });
});

describe("CreditHistory", () => {
  const operations = [
    { id: "o1", type: "consume" as const, status: "succeeded" as const, credit_amount: "12.5", feature_code: "emails", occurred_at: "2026-10-14T10:00:00Z" },
    { id: "o2", type: "grant" as const, status: "succeeded" as const, credit_amount: "500", feature_code: null, occurred_at: "2026-10-13T10:00:00Z" },
  ];

  it("lists operations and loads more", () => {
    const onLoadMore = vi.fn();
    render(<CreditHistory operations={operations} hasMore onLoadMore={onLoadMore} />);
    expect(screen.getByText("Used")).toBeTruthy();
    expect(screen.getByText("emails")).toBeTruthy();
    expect(screen.getByText("12.5")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(onLoadMore).toHaveBeenCalledOnce();
  });

  it("shows loading, error and empty states", () => {
    const { rerender } = render(<CreditHistory isLoading />);
    expect(screen.getByLabelText("Loading credit history")).toBeTruthy();
    rerender(<CreditHistory error="History unavailable" />);
    expect(screen.getByRole("alert").textContent).toBe("History unavailable");
    rerender(<CreditHistory operations={[]} />);
    expect(screen.getByRole("status").textContent).toBe("No credit activity yet.");
  });
});
