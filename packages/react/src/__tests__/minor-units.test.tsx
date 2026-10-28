import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { currencyFactor, formatMinorAmount } from "../components/billing/amounts.js";
import { PlanCard } from "../components/pricing/PlanCard.js";
import { PlanComparison } from "../components/pricing/PlanComparison.js";
import { formatPlanPrice, planFeatures } from "../components/pricing/plan-features.js";
import { formatAmount } from "../components/usage/usage-data.js";

afterEach(cleanup);

const nbsp = " ";

describe("currency minor units follow Core's Money table", () => {
  it("uses Core's factors, not Intl's digits", () => {
    expect(currencyFactor("USD")).toBe(100);
    expect(currencyFactor("jpy")).toBe(1);
    expect(currencyFactor("KWD")).toBe(1000);
    expect(currencyFactor("HUF")).toBe(1);
    expect(currencyFactor("CLF")).toBe(10000);
    expect(currencyFactor("MRO")).toBe(5);
  });

  it("formats plan prices in each currency's minor units", () => {
    expect(formatPlanPrice(1499, "USD")).toBe("$14.99");
    expect(formatPlanPrice(1500, "USD")).toBe("$15");
    expect(formatPlanPrice(1500, "JPY")).toBe("¥1,500");
    expect(formatPlanPrice(12345, "KWD")).toBe(`KWD${nbsp}12.345`);
    expect(formatPlanPrice(12000, "KWD")).toBe(`KWD${nbsp}12`);
    expect(formatPlanPrice(1500, "HUF")).toBe(`HUF${nbsp}1,500`);
  });

  it("formats billing amounts with Core's digits", () => {
    expect(formatMinorAmount(5, "KWD")).toBe(`KWD${nbsp}0.005`);
    expect(formatMinorAmount(1500, "HUF")).toBe(`HUF${nbsp}1,500`);
    expect(formatMinorAmount(7, "MRO")).toBe(`MRO${nbsp}1.4`);
    expect(formatMinorAmount(-1, "USD")).toBe("-$0.01");
    expect(formatAmount(1500, "JPY")).toBe("¥1,500");
  });

  it("formats with the given locale", () => {
    expect(formatPlanPrice(1499, "EUR", "de-DE")).toBe(`14,99${nbsp}€`);
    expect(formatPlanPrice(150000, "JPY", "de-DE")).toBe(`150.000${nbsp}¥`);
    expect(
      planFeatures(
        {
          amount_currency: "EUR",
          entitlements: [{ feature_type: "metered", code: "calls", name: "calls", usage_limit: 100000 }],
          charges: [{ charge_model: "standard", feature_code: "calls", properties: { amount: "0.015" } }],
        },
        "de-DE",
      ),
    ).toEqual(["100.000 calls", `0,015${nbsp}€ per calls`]);
  });

  // Testing Library collapses the no-break space to a space when matching text.
  it("renders PlanCard and PlanComparison prices with the locale prop", () => {
    const plan = { code: "pro", name: "Pro", amount_cents: 150000, amount_currency: "JPY", interval: "monthly" };
    render(<PlanCard plan={plan} isCurrent={false} locale="de-DE" />);
    expect(screen.getByText("150.000 ¥")).toBeTruthy();
    cleanup();
    render(<PlanComparison plans={[plan]} locale="de-DE" />);
    expect(screen.getByText("150.000 ¥ / month")).toBeTruthy();
  });
});
