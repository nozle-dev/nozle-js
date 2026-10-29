import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {
  BillingProvider,
  CheckoutButton,
  PricingTable,
  getAvailableCurrencies,
  getPricingCards,
  type PricingFamily,
  type PricingPlan,
} from "../index";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ref = { code: "pro", currencies: ["USD", "EUR"], default_currency: "USD" };
const prices = [
  { currency: "USD", interval: "monthly", plan_code: "pro", amount_cents: 1000 },
  { currency: "USD", interval: "yearly", plan_code: "pro_yearly", amount_cents: 10000 },
  { currency: "EUR", interval: "monthly", plan_code: "pro_eur", amount_cents: 900 },
  { currency: "EUR", interval: "yearly", plan_code: "pro_yearly_eur", amount_cents: 10800 },
];
const variant = (code: string, interval: string, amount: number, currency: string): PricingPlan => ({
  code, name: "Pro", interval, amount_cents: amount, amount_currency: currency, family: ref, prices,
});
const usd = [variant("pro", "monthly", 1000, "USD"), variant("pro_yearly", "yearly", 10000, "USD")];
const eur = [variant("pro_eur", "monthly", 900, "EUR"), variant("pro_yearly_eur", "yearly", 10800, "EUR")];
const family = (codes: string[]): PricingFamily => ({ code: "pro", name: "Pro", plan_codes: codes });

describe("catalog currency", () => {
  it("lists the offered currencies from families and prices", () => {
    expect(getAvailableCurrencies({ plans: usd })).toEqual(["USD", "EUR"]);
    expect(getAvailableCurrencies({ plans: [{ ...usd[0], family: null, prices: undefined }] })).toEqual(["USD"]);
  });

  it("keeps each card in one currency and computes savings only within it", () => {
    const plans = [...usd, ...eur];
    const all = family(plans.map((plan) => plan.code));
    // EUR yearly costs 10800 against 12 x 900 = 10800: no saving. USD yearly saves 17% against USD monthly.
    const [eurCard] = getPricingCards({ plans, families: [all], currency: "eur" }, { interval: "yearly" });
    expect(eurCard.plans.map((plan) => plan.code)).toEqual(["pro_eur", "pro_yearly_eur"]);
    expect(eurCard.savingsPercent).toBeNull();
    expect(eurCard.price).toBe("€9");
    const [usdCard] = getPricingCards({ plans, families: [all] }, { interval: "yearly" });
    expect(usdCard.plans.map((plan) => plan.code)).toEqual(["pro", "pro_yearly"]);
    expect(usdCard.savingsPercent).toBe(17);
  });

  it("switches currency, refetches the catalog in it and checks out the variant", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const inEur = new URL(String(input)).searchParams.get("currency") === "EUR";
      return Response.json({ plans: inEur ? eur : usd, families: [family((inEur ? eur : usd).map((p) => p.code))], meta: {} });
    });
    vi.stubGlobal("fetch", fetchMock);
    const createCheckout = vi.fn().mockResolvedValue({ type: "completed", status: "succeeded" });
    render(
      <BillingProvider publishableKey="pk_test" createCheckout={createCheckout}>
        <PricingTable returnUrl="https://merchant.example/done" />
      </BillingProvider>,
    );
    const currencies = await screen.findByRole("group", { name: "Currency" });
    expect(within(currencies).getByRole("button", { name: "USD" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(currencies).getByRole("button", { name: "EUR" }));
    await screen.findByText("€9");
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toContain("https://api.nozle.app/engine/api/v1/plans?currency=EUR");
    expect(within(currencies).getByRole("button", { name: "EUR" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Get Pro" }));
    await waitFor(() => expect(createCheckout).toHaveBeenCalledWith({
      planCode: "pro_eur", currency: "EUR", returnUrl: "https://merchant.example/done",
    }));
  });

  it("shows no currency switch for one currency and honours the currencies prop", () => {
    const single = usd.map((plan) => ({ ...plan, family: { ...ref, currencies: ["USD"] }, prices: [] }));
    render(<PricingTable plans={single} onSelect={() => undefined} />);
    expect(screen.queryByRole("group", { name: "Currency" })).toBeNull();
    cleanup();
    render(<PricingTable plans={[...usd, ...eur]} families={[family([...usd, ...eur].map((p) => p.code))]} currency="eur" currencies={["usd", "eur", "gbp"]} onSelect={() => undefined} />);
    const group = screen.getByRole("group", { name: "Currency" });
    expect(within(group).getAllByRole("button").map((b) => b.textContent)).toEqual(["USD", "EUR", "GBP"]);
    expect(screen.getByText("€9")).toBeTruthy();
  });

  it("CheckoutButton sells a family variant with its currency", async () => {
    const createCheckout = vi.fn().mockResolvedValue({ type: "completed", status: "succeeded" });
    render(
      <BillingProvider publishableKey="pk_test" createCheckout={createCheckout}>
        <CheckoutButton planFamilyCode="pro" interval="yearly" currency="EUR" returnUrl="https://merchant.example/done" />
      </BillingProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Get Started" }));
    await waitFor(() => expect(createCheckout).toHaveBeenCalledWith({
      idempotencyKey: expect.any(String), planFamilyCode: "pro", interval: "yearly", currency: "EUR",
      returnUrl: "https://merchant.example/done",
    }));
  });
});
