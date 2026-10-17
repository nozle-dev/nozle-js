import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PricingTable } from "../components/pricing/PricingTable";
import { comparisonRows, planFeatures, sortPlansByPrice } from "../components/pricing/plan-features";

afterEach(cleanup);

const pro = {
  code: "pro",
  name: "Pro",
  amount_cents: 1499,
  amount_currency: "USD",
  interval: "monthly",
  entitlements: [
    { feature_type: "metered", code: "api_calls", name: "API calls", usage_limit: 100000, privileges: [] },
    { feature_type: "metered", code: "seats", name: "Seats", usage_limit: null, privileges: [] },
    { feature_type: "boolean", code: "sso", name: "SAML SSO", privileges: [] },
    {
      feature_type: "config",
      code: "support",
      name: "Support",
      privileges: [{ code: "tier", name: "Tier", value_type: "select", value: "priority" }],
    },
  ],
  credit_grant_rules: [{ credit_system_code: "ai_credits", amount: "500.0", interval: "month", interval_count: 1 }],
  charges: [
    { charge_model: "standard", feature_code: "api_calls", properties: { amount: "0.01" } },
    { charge_model: "graduated", feature_code: "emails", properties: {} },
  ],
};

describe("planFeatures", () => {
  it("turns entitlements, credit grants and flat usage prices into lines", () => {
    expect(planFeatures(pro)).toEqual([
      "100,000 API calls",
      "Seats",
      "SAML SSO",
      "Support: priority",
      "500 ai credits every month",
      "$0.01 per api calls",
    ]);
  });

  it("describes grants by interval", () => {
    expect(planFeatures({ amount_currency: "USD", credit_grant_rules: [{ credit_system_code: "c", amount: "10", interval: "month", interval_count: 3 }] })).toEqual(["10 c every 3 months"]);
    expect(planFeatures({ amount_currency: "USD", credit_grant_rules: [{ credit_system_code: "c", amount: "10", interval: "lifetime" }] })).toEqual(["10 c (one time)"]);
  });

  it("writes tiered, package, volume and percentage charges as lines", () => {
    const lines = planFeatures({
      amount_currency: "USD",
      charges: [
        {
          charge_model: "graduated",
          feature_code: "emails",
          properties: {
            graduated_ranges: [
              { from_value: 0, to_value: 1000, per_unit_amount: "0", flat_amount: "0" },
              { from_value: 1001, to_value: null, per_unit_amount: "0.01", flat_amount: "0" },
            ],
          },
        },
        { charge_model: "package", feature_code: "sms", properties: { amount: "5", package_size: 100, free_units: 50 } },
        {
          charge_model: "volume",
          feature_code: "files",
          properties: { volume_ranges: [{ from_value: 0, to_value: null, per_unit_amount: "0.5", flat_amount: "2" }] },
        },
        { charge_model: "percentage", feature_code: "payment", properties: { rate: "2.9", fixed_amount: "0.3" } },
        { charge_model: "custom", feature_code: "x", properties: {} },
      ],
    });
    expect(lines).toEqual([
      "0 to 1,000 emails: free",
      "1,001+ emails: $0.01 each",
      "$5.00 per 100 sms, first 50 free",
      "0+ files: $2.00 flat + $0.50 each",
      "2.9% of each payment + $0.30 per payment",
    ]);
  });

  it("returns no lines for a plan without catalog data", () => {
    expect(planFeatures({ amount_currency: "USD" })).toEqual([]);
  });
});

describe("PricingTable interval", () => {
  it("labels every billing interval, not only year and month", () => {
    render(<PricingTable plans={[{ ...pro, code: "q", interval: "quarterly" }]} showToggle={false} />);
    expect(screen.getByText("/quarter")).toBeTruthy();
  });
});

describe("PricingTable interval", () => {
  it("labels every billing interval, not only year and month", () => {
    render(<PricingTable plans={[{ ...pro, code: "q", interval: "quarterly" }]} showToggle={false} />);
    expect(screen.getByText("/quarter")).toBeTruthy();
  });
});

describe("PricingTable features", () => {
  it("lets a features array replace a plan's generated lines", () => {
    render(<PricingTable plans={[pro]} features={[["Hand written"]]} />);
    expect(screen.getByText("Hand written")).toBeTruthy();
    expect(screen.queryByText("100,000 API calls")).toBeNull();
  });

  it("lets a features object keyed by plan code replace only that plan", () => {
    render(
      <PricingTable
        plans={[pro, { ...pro, code: "team", name: "Team" }]}
        features={{ team: ["Team only line"] }}
        showToggle={false}
      />,
    );
    expect(screen.getByText("Team only line")).toBeTruthy();
    expect(screen.getAllByText("100,000 API calls")).toHaveLength(1);
  });

  it("lists what the plan gives from the catalog", () => {
    render(<PricingTable plans={[pro]} />);
    expect(screen.getByText("100,000 API calls")).toBeTruthy();
    expect(screen.getByText("SAML SSO")).toBeTruthy();
  });
});

describe("comparisonRows", () => {
  it("builds one row per entitlement and credit grant and marks gaps", () => {
    const rows = comparisonRows([
      { code: "free", amount_currency: "USD", entitlements: [{ feature_type: "boolean", code: "sso", name: "SSO" }] },
      {
        code: "pro",
        amount_currency: "USD",
        entitlements: [
          { feature_type: "boolean", code: "sso", name: "SSO" },
          { feature_type: "config", code: "support", name: "Support", privileges: [{ code: "tier", name: "Tier", value_type: "select", value: "priority" }] },
        ],
        credit_grant_rules: [{ credit_system_code: "ai_credits", amount: "500", interval: "month" }],
      },
    ]);
    expect(rows).toEqual([
      { key: "entitlement:sso", label: "SSO", values: { free: true, pro: true } },
      { key: "entitlement:support", label: "Support", values: { pro: "priority", free: false } },
      { key: "credit:ai_credits", label: "ai credits", values: { pro: "500 ai credits every month", free: false } },
    ]);
  });
});

describe("plan order", () => {
  const mk = (code: string, amount_cents: number, amount_currency = "USD") => ({
    code, name: code, amount_cents, amount_currency, interval: "monthly",
  });
  const headings = () => screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);

  it("sorts plans cheapest first and keeps ties in catalog order", () => {
    expect(sortPlansByPrice([mk("team", 6000), mk("free", 0), mk("a", 3000), mk("b", 3000)]).map((p) => p.code)).toEqual(["free", "a", "b", "team"]);
  });

  it("keeps currencies grouped in the order they first appear", () => {
    expect(sortPlansByPrice([mk("inr_pro", 99900, "INR"), mk("usd_pro", 1500), mk("inr_free", 0, "INR")]).map((p) => p.code)).toEqual(["inr_free", "inr_pro", "usd_pro"]);
  });

  it("shows PricingTable plans cheapest first with custom plans last", () => {
    render(<PricingTable plans={[mk("enterprise", 0), mk("team", 6000), mk("free", 0), mk("pro", 999)]} contactSalesPlans={["enterprise"]} showToggle={false} />);
    expect(headings()).toEqual(["free", "pro", "team", "enterprise"]);
  });

  it("treats a plan as contact-sales only when its code is listed, never by its name", () => {
    render(<PricingTable plans={[mk("enterprise", 0), mk("pro", 999)]} showToggle={false} />);
    expect(headings()).toEqual(["enterprise", "pro"]);
    expect(screen.queryByText("Custom")).toBeNull();
  });

  it("lets a sort function replace the order", () => {
    render(<PricingTable plans={[mk("free", 0), mk("pro", 999)]} showToggle={false} sort={(a, b) => b.amount_cents - a.amount_cents} />);
    expect(headings()).toEqual(["pro", "free"]);
  });
});
