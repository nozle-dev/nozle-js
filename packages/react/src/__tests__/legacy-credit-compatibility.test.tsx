import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BillingPortal } from "../components/billing/BillingPortal";
import { CreditBalance } from "../components/billing/CreditBalance";

vi.mock("../hooks/use-credits", () => ({
  useCredits: () => ({ balance: 12.5, loading: false, error: null }),
}));

vi.mock("../components/billing/CurrentPlan", () => ({
  CurrentPlan: ({ customerId }: { customerId: string }) => (
    <div>Plan for {customerId}</div>
  ),
}));

vi.mock("../components/billing/InvoiceList", () => ({
  InvoiceList: ({ customerId }: { customerId: string }) => (
    <div>Invoices for {customerId}</div>
  ),
}));

describe("legacy credit compatibility", () => {
  it("preserves the CreditBalance customer wallet API", () => {
    render(
      <CreditBalance customerId="customer-1" unit="currency" currency="USD" />,
    );

    expect(screen.getByText("$12.50")).toBeTruthy();
  });

  it("keeps BillingPortal's legacy credit section without a product system prop", () => {
    render(<BillingPortal customerId="customer-1" />);

    expect(screen.getByText("Plan for customer-1")).toBeTruthy();
    expect(screen.getByText("Invoices for customer-1")).toBeTruthy();
    expect(screen.getByText("12.5 credits")).toBeTruthy();
  });
});
