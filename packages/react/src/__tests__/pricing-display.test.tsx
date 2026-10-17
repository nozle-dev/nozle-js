import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  BillingProvider,
  PricingTable,
  getAvailableIntervals,
  getDefaultInterval,
  getPricingCards,
  getPricingIntervalOptions,
  type PricingCatalog,
  type PricingEntitlement,
  type PricingFamily,
  type PricingPlan,
} from "../index";
import { formatMinorAmount } from "../components/billing/amounts.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function plan(code: string, extra: Partial<PricingPlan> = {}): PricingPlan {
  return {
    code,
    name: code.charAt(0).toUpperCase() + code.slice(1),
    amount_cents: 1000,
    amount_currency: "USD",
    interval: "monthly",
    ...extra,
  };
}

function family(code: string, planCodes: string[], extra: Partial<PricingFamily> = {}): PricingFamily {
  return {
    code,
    name: code.charAt(0).toUpperCase() + code.slice(1),
    plan_codes: planCodes,
    ...extra,
  };
}

function projects(value: number): PricingEntitlement {
  return {
    code: "projects",
    name: "Projects",
    privileges: [{ code: "max", name: "Max", value_type: "integer", value }],
  };
}

// Starter and Pro sold monthly and yearly, Team monthly only.
function catalog(): PricingCatalog {
  return {
    plans: [
      plan("starter_monthly", { name: "Starter Monthly", amount_cents: 1000, entitlements: [projects(3)] }),
      plan("starter_yearly", { name: "Starter Yearly", interval: "yearly", amount_cents: 10000, entitlements: [projects(5)] }),
      plan("pro_monthly", { name: "Pro Monthly", amount_cents: 4900, entitlements: [projects(20)] }),
      plan("pro_yearly", { name: "Pro Yearly", interval: "yearly", amount_cents: 49000, entitlements: [projects(40)] }),
      plan("team_monthly", { name: "Team Monthly", amount_cents: 9900 }),
    ],
    families: [
      family("team", ["team_monthly"], { pricing_position: null }),
      family("pro", ["pro_monthly", "pro_yearly"], {
        pricing_position: 1,
        pricing_highlighted: true,
        description: "For growing teams",
        features: [
          { code: "projects", name: "Projects", description: "Active projects", show_on_pricing: true, show_description: true, display_position: 0 },
        ],
      }),
      family("starter", ["starter_monthly", "starter_yearly"], {
        pricing_position: 0,
        features: [{ code: "projects", name: "Projects", show_on_pricing: true, show_description: false, display_position: null }],
      }),
    ],
  };
}

function card(key: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-card-key="${key}"]`);
  if (!element) throw new Error(`No card for ${key}`);
  return element;
}

function cardKeys(): string[] {
  return Array.from(document.querySelectorAll("[data-card-key]")).map(
    (element) => element.getAttribute("data-card-key") ?? "",
  );
}

function listItems(key: string): string[] {
  return within(card(key))
    .queryAllByRole("listitem")
    .map((item) => item.textContent ?? "");
}

function intervalButton(label: string | RegExp): HTMLElement {
  return within(screen.getByRole("group", { name: "Billing interval" })).getByRole("button", { name: label });
}

function intervalLabels(): string[] {
  const group = screen.queryByRole("group", { name: "Billing interval" });
  if (!group) return [];
  return within(group).getAllByRole("button").map((button) => button.textContent ?? "");
}

describe("getPricingCards", () => {
  it("groups plans by family, ordered by pricing_position with nulls last", () => {
    const cards = getPricingCards(catalog(), { interval: "monthly" });
    expect(cards.map((c) => c.key)).toEqual(["starter", "pro", "team"]);
    expect(cards.map((c) => c.plan.code)).toEqual(["starter_monthly", "pro_monthly", "team_monthly"]);
    expect(cards[1].plans.map((p) => p.code)).toEqual(["pro_monthly", "pro_yearly"]);
    expect(cards[1].name).toBe("Pro");
    expect(cards[1].description).toBe("For growing teams");
  });

  it("keeps API order for families without positions", () => {
    const cards = getPricingCards({
      plans: [plan("a"), plan("b"), plan("c")],
      families: [family("c", ["c"]), family("a", ["a"]), family("b", ["b"], { pricing_position: 0 })],
    });
    expect(cards.map((c) => c.key)).toEqual(["b", "c", "a"]);
  });

  it("hides families with show_on_pricing false or no live plans, and pending plans", () => {
    const cards = getPricingCards({
      plans: [
        plan("visible"),
        plan("visible_yearly", { interval: "yearly", pending_deletion: true }),
        plan("hidden"),
        plan("gone", { pending_deletion: true }),
      ],
      families: [
        family("visible", ["visible", "visible_yearly"]),
        family("hidden", ["hidden"], { show_on_pricing: false }),
        family("gone", ["gone"]),
        family("empty", []),
      ],
    });
    expect(cards.map((c) => c.key)).toEqual(["visible"]);
    expect(cards[0].plans.map((p) => p.code)).toEqual(["visible"]);
    expect(getAvailableIntervals({ plans: [plan("visible"), plan("visible_yearly", { interval: "yearly", pending_deletion: true })], families: [family("visible", ["visible", "visible_yearly"])] })).toEqual(["monthly"]);
  });

  it("shows per-month equivalents and savings for USD", () => {
    const cards = getPricingCards(catalog(), { interval: "yearly" });
    const pro = cards.find((c) => c.key === "pro")!;
    expect(pro.plan.code).toBe("pro_yearly");
    expect(pro.price).toBe("$40.83");
    expect(pro.pricePeriod).toBe("/mo");
    expect(pro.billing).toBe("Billed $490 yearly · save 17%");
    expect(pro.savingsPercent).toBe(17);
    const monthly = getPricingCards(catalog(), { interval: "monthly" }).find((c) => c.key === "pro")!;
    expect(monthly.price).toBe("$49");
    expect(monthly.billing).toBe("Billed monthly");
    expect(monthly.savingsPercent).toBeNull();
  });

  it("formats JPY exactly in minor units", () => {
    const cards = getPricingCards(
      {
        plans: [
          plan("m", { amount_cents: 1500, amount_currency: "JPY" }),
          plan("y", { interval: "yearly", amount_cents: 15000, amount_currency: "JPY" }),
        ],
        families: [family("jp", ["m", "y"])],
      },
      { interval: "yearly" },
    );
    expect(cards[0].price).toBe("¥1,250");
    expect(cards[0].billing).toBe("Billed ¥15,000 yearly · save 17%");
  });

  it("covers weekly, quarterly and semiannual billing lines", () => {
    const data: PricingCatalog = {
      plans: [
        plan("w", { interval: "weekly", amount_cents: 1000 }),
        plan("m", { amount_cents: 5000 }),
        plan("q", { interval: "quarterly", amount_cents: 13500 }),
        plan("s", { interval: "semiannual", amount_cents: 30000 }),
      ],
      families: [family("all", ["w", "m", "q", "s"])],
    };
    expect(getPricingCards(data, { interval: "weekly" })[0]).toMatchObject({
      price: "$43.33",
      billing: "Billed $10 weekly · save 13%",
    });
    expect(getPricingCards(data, { interval: "quarterly" })[0]).toMatchObject({
      price: "$45",
      billing: "Billed $135 quarterly · save 10%",
    });
    expect(getPricingCards(data, { interval: "semiannual" })[0]).toMatchObject({
      price: "$50",
      billing: "Billed $300 every 6 months",
      savingsPercent: null,
    });
  });

  it("falls back to the nearest interval when a family has no plan for it", () => {
    const cards = getPricingCards(catalog(), { interval: "yearly" });
    const team = cards.find((c) => c.key === "team")!;
    expect(team.plan.code).toBe("team_monthly");
    expect(team.isFallbackInterval).toBe(true);
    expect(team.billing).toBe("Billed monthly");
    const spread: PricingCatalog = {
      plans: [plan("m"), plan("s", { interval: "semiannual" }), plan("y", { interval: "yearly" })],
      families: [family("f", ["m", "s", "y"])],
    };
    // Equally near: the shorter interval wins.
    expect(getPricingCards(spread, { interval: "quarterly" })[0].plan.code).toBe("m");
    expect(getPricingCards(spread, { interval: "weekly" })[0].plan.code).toBe("m");
    const yearlyOnly: PricingCatalog = { plans: [plan("q", { interval: "quarterly" }), plan("y", { interval: "yearly" })], families: [family("f", ["q", "y"])] };
    expect(getPricingCards(yearlyOnly, { interval: "semiannual" })[0].plan.code).toBe("q");
    expect(getPricingCards(yearlyOnly, { interval: "monthly" })[0].plan.code).toBe("q");
  });

  it("accepts annual as an alias for yearly", () => {
    expect(getPricingCards(catalog(), { interval: "annual" })[0].plan.code).toBe("starter_yearly");
    expect(getDefaultInterval(catalog(), "annual")).toBe("yearly");
    expect(getDefaultInterval(catalog())).toBe("monthly");
    expect(getDefaultInterval({ plans: [plan("y", { interval: "yearly" }), plan("q", { interval: "quarterly" })] })).toBe("quarterly");
  });

  it("highlights by family code, by plan code, or by the stored flag, at most once", () => {
    const highlighted = (highlight?: string) =>
      getPricingCards(catalog(), { highlight }).filter((c) => c.highlighted).map((c) => c.key);
    expect(highlighted()).toEqual(["pro"]);
    expect(highlighted("team")).toEqual(["team"]);
    expect(highlighted("starter_yearly")).toEqual(["starter"]);
    expect(highlighted("unknown")).toEqual([]);
    const twoFlags = getPricingCards({
      plans: [plan("a"), plan("b")],
      families: [family("a", ["a"], { pricing_highlighted: true }), family("b", ["b"], { pricing_highlighted: true })],
    });
    expect(twoFlags.filter((c) => c.highlighted).map((c) => c.key)).toEqual(["a"]);
  });

  it("uses badge_text and cta_text with defaults", () => {
    const data = catalog();
    data.families![1].badge_text = "Best value";
    data.families![2].cta_text = "Start free";
    const cards = getPricingCards(data);
    expect(cards.map((c) => [c.key, c.badge, c.cta])).toEqual([
      ["starter", null, "Start free"],
      ["pro", "Best value", "Get Pro"],
      ["team", null, "Get Team"],
    ]);
    data.families![1].badge_text = "  ";
    expect(getPricingCards(data)[1].badge).toBe("Most Popular");
  });

  it("orders and filters family features with values from the selected plan", () => {
    const data: PricingCatalog = {
      plans: [
        plan("m", {
          entitlements: [
            projects(20),
            { code: "seats", name: "Seats", privileges: [{ code: "max", value_type: "integer", value: 1500 }] },
            { code: "sso", name: "SSO", privileges: [{ code: "on", value_type: "boolean", value: true }] },
            {
              code: "storage",
              name: "Storage",
              privileges: [
                { code: "gb", name: "GB", value_type: "integer", value: 10 },
                { code: "tier", name: null, value_type: "string", value: "fast" },
              ],
            },
          ],
        }),
        plan("y", { interval: "yearly", entitlements: [projects(50)] }),
      ],
      families: [
        family("f", ["m", "y"], {
          features: [
            { code: "storage", name: "Storage", display_position: null },
            { code: "seats", name: "Seats", display_position: null, description: "Not flagged" },
            { code: "secret", name: "Secret", show_on_pricing: false, display_position: 0 },
            { code: "sso", name: "SSO", display_position: 1, show_description: true, description: "SAML" },
            { code: "projects", name: "Projects", display_position: 0, show_description: true, description: "   " },
            { code: "support", name: "Priority support", display_position: null, show_description: false, description: "Hidden" },
          ],
        }),
      ],
    };
    expect(getPricingCards(data, { interval: "monthly" })[0].features).toEqual([
      { label: "Projects: 20" },
      { label: "SSO", description: "SAML" },
      { label: "Priority support" },
      { label: "Seats: 1,500" },
      { label: "Storage (GB: 10, tier: fast)" },
    ]);
    expect(getPricingCards(data, { interval: "yearly" })[0].features.map((f) => f.label)).toEqual([
      "Projects: 50",
      "SSO",
      "Priority support",
      "Seats",
      "Storage",
    ]);
    expect(getPricingCards(data, { interval: "monthly", locale: "de-DE" })[0].features[3].label).toBe("Seats: 1.500");
  });

  it("shows a metered feature's usage limit as its value", () => {
    const data: PricingCatalog = {
      plans: [
        plan("m", {
          entitlements: [{ feature_type: "metered", code: "api_calls", name: "API calls", usage_limit: 100000, privileges: [] }],
        }),
      ],
      families: [family("f", ["m"], { features: [{ code: "api_calls", name: "API calls" }] })],
    };
    expect(getPricingCards(data)[0].features).toEqual([{ label: "API calls: 100,000" }]);
  });

  it("falls back to en-US on a malformed locale", () => {
    expect(() => getPricingCards(catalog(), { locale: "en_US" })).not.toThrow();
    const pro = getPricingCards(catalog(), { locale: "en_US", interval: "yearly" })[1];
    expect(pro.price).toBe("$40.83");
  });

  it("uses feature overrides keyed by family code or plan code", () => {
    const cards = getPricingCards(catalog(), {
      interval: "yearly",
      features: { pro: ["Family override"], starter_yearly: [{ label: "Plan override", description: "Yearly only" }] },
    });
    expect(cards[0].features).toEqual([{ label: "Plan override", description: "Yearly only" }]);
    expect(cards[1].features).toEqual([{ label: "Family override" }]);
    expect(cards[2].features).toEqual([]);
  });

  it("treats each plan as its own card when the catalog has no families", () => {
    const legacy: PricingCatalog = {
      plans: [
        plan("free", {
          amount_cents: 0,
          entitlements: [
            { feature_type: "metered", code: "seats", name: "Seats", usage_limit: 3 },
            { feature_type: "boolean", code: "api", name: "API" },
          ],
        }),
        plan("pro", { amount_cents: 5000 }),
        plan("pro_yearly", { interval: "yearly", amount_cents: 50000 }),
        plan("old", { pending_deletion: true }),
      ],
    };
    expect(getPricingCards(legacy).map((c) => c.key)).toEqual(["free", "pro", "pro_yearly"]);
    expect(getPricingCards(legacy, { interval: "yearly" }).map((c) => c.key)).toEqual(["pro_yearly"]);
    const [free] = getPricingCards(legacy);
    expect(free.family).toBeNull();
    // Without families the lines are what the plan gives, as planFeatures lists them.
    expect(free.features).toEqual([{ label: "3 Seats" }, { label: "API" }]);
    expect(free.cta).toBe("Get Free");
    expect(getPricingCards(legacy, { interval: "yearly" })[0]).toMatchObject({
      price: "$41.67",
      billing: "Billed $500 yearly",
      savingsPercent: null,
    });
    expect(getPricingCards(legacy, { highlight: "pro" }).filter((c) => c.highlighted).map((c) => c.key)).toEqual(["pro"]);
  });

  it("does not mutate its input", () => {
    const data = catalog();
    const snapshot = JSON.stringify(data);
    getPricingCards(data, { interval: "yearly" });
    getPricingIntervalOptions(data);
    expect(JSON.stringify(data)).toBe(snapshot);
  });
});

describe("getAvailableIntervals and getPricingIntervalOptions", () => {
  it("lists intervals of visible families in canonical order with the best saving", () => {
    const data: PricingCatalog = {
      plans: [
        plan("a_y", { interval: "yearly", amount_cents: 9000 }),
        plan("a_m", { amount_cents: 1000 }),
        plan("b_m", { amount_cents: 1000 }),
        plan("b_y", { interval: "yearly", amount_cents: 10000 }),
        plan("b_q", { interval: "quarterly", amount_cents: 3000 }),
        plan("h_w", { interval: "weekly" }),
      ],
      families: [
        family("a", ["a_m", "a_y"]),
        family("b", ["b_m", "b_q", "b_y"]),
        family("h", ["h_w"], { show_on_pricing: false }),
      ],
    };
    expect(getAvailableIntervals(data)).toEqual(["monthly", "quarterly", "yearly"]);
    expect(getPricingIntervalOptions(data)).toEqual([
      { interval: "monthly", label: "Monthly", savingsPercent: null },
      { interval: "quarterly", label: "Quarterly", savingsPercent: null },
      { interval: "yearly", label: "Annual", savingsPercent: 25 },
    ]);
  });

  it("labels every interval", () => {
    const data: PricingCatalog = {
      plans: ["yearly", "semiannual", "quarterly", "monthly", "weekly"].map((interval) => plan(interval, { interval })),
      families: [family("f", ["weekly", "monthly", "quarterly", "semiannual", "yearly"])],
    };
    expect(getPricingIntervalOptions(data).map((o) => o.label)).toEqual([
      "Weekly",
      "Monthly",
      "Quarterly",
      "Every 6 months",
      "Annual",
    ]);
  });
});

describe("PricingTable with plan families", () => {
  it("defaults the highlight to the theme's AA indigo and takes colorHighlight from the appearance", () => {
    const data = catalog();
    const { rerender } = render(<PricingTable plans={data.plans} families={data.families} onSelect={() => undefined} />);
    // colorHighlight, then colorPrimary (and its older names), then #4f46e5: white text on it is 6.3:1.
    expect(card("pro").outerHTML).toContain("var(--nozle-highlight, var(--nozle-primary, var(--nozle-pricing-highlight, var(--nozle-portal-accent, #4f46e5))))");
    expect(card("pro").outerHTML).not.toContain("#6366f1");
    rerender(
      <PricingTable
        plans={data.plans}
        families={data.families}
        onSelect={() => undefined}
        appearance={{ variables: { colorHighlight: "#0f766e" } }}
      />,
    );
    const root = document.querySelector<HTMLElement>(".nozle-pricingTable");
    expect(root?.style.getPropertyValue("--nozle-highlight")).toBe("#0f766e");
    expect(within(card("pro")).getByRole("button", { name: "Get Pro" }).outerHTML).toContain("var(--nozle-highlight");
  });

  it("renders one card per family and switches intervals", () => {
    const data = catalog();
    render(<PricingTable plans={data.plans} families={data.families} onSelect={() => undefined} />);
    expect(cardKeys()).toEqual(["starter", "pro", "team"]);
    expect(intervalLabels()).toEqual(["Monthly", "AnnualSave 17%"]);
    // The saving is part of the accessible name, separated from the label.
    expect(intervalButton("Annual, save 17%")).toBeTruthy();
    expect(intervalButton("Monthly").getAttribute("aria-pressed")).toBe("true");
    expect(card("pro").getAttribute("data-plan-code")).toBe("pro_monthly");
    expect(within(card("pro")).getByText("$49")).toBeTruthy();
    expect(within(card("pro")).getByText("/mo")).toBeTruthy();
    expect(within(card("pro")).getByText("Billed monthly")).toBeTruthy();
    expect(listItems("pro")).toEqual(["Projects: 20Active projects"]);
    expect(listItems("starter")).toEqual(["Projects: 3"]);

    fireEvent.click(intervalButton(/Annual/));
    expect(cardKeys()).toEqual(["starter", "pro", "team"]);
    expect(card("pro").getAttribute("data-plan-code")).toBe("pro_yearly");
    expect(within(card("pro")).getByText("$40.83")).toBeTruthy();
    expect(within(card("pro")).getByText("Billed $490 yearly · save 17%")).toBeTruthy();
    expect(listItems("pro")).toEqual(["Projects: 40Active projects"]);
    // Team has no yearly plan: it keeps its monthly plan and real billing line.
    expect(card("team").getAttribute("data-plan-code")).toBe("team_monthly");
    expect(within(card("team")).getByText("Billed monthly")).toBeTruthy();
  });

  it("highlights the stored family once with the default badge", () => {
    const data = catalog();
    render(<PricingTable plans={data.plans} families={data.families} />);
    expect(card("pro").getAttribute("data-highlighted")).toBe("true");
    expect(document.querySelectorAll('[data-highlighted="true"]')).toHaveLength(1);
    expect(within(card("pro")).getByText("Most Popular")).toBeTruthy();
  });

  it("lets highlightPlan pick a family by family code or plan code", () => {
    const data = catalog();
    const { rerender } = render(<PricingTable plans={data.plans} families={data.families} highlightPlan="team" />);
    expect(card("team").getAttribute("data-highlighted")).toBe("true");
    expect(card("pro").getAttribute("data-highlighted")).toBeNull();
    rerender(<PricingTable plans={data.plans} families={data.families} highlightPlan="starter_yearly" />);
    expect(card("starter").getAttribute("data-highlighted")).toBe("true");
    expect(screen.getAllByText("Most Popular")).toHaveLength(1);
  });

  it("shows badge_text and cta_text", () => {
    const data = catalog();
    data.families![1].badge_text = "Best value";
    data.families![1].cta_text = "Start trial";
    render(<PricingTable plans={data.plans} families={data.families} onSelect={() => undefined} />);
    expect(within(card("pro")).getByText("Best value")).toBeTruthy();
    expect(within(card("pro")).getByRole("button", { name: "Start trial" })).toBeTruthy();
    expect(within(card("starter")).getByRole("button", { name: "Get Starter" })).toBeTruthy();
  });

  it("passes the selected interval's plan and its family to onSelect", () => {
    const data = catalog();
    const onSelect = vi.fn();
    render(<PricingTable plans={data.plans} families={data.families} onSelect={onSelect} />);
    fireEvent.click(intervalButton(/Annual/));
    fireEvent.click(within(card("pro")).getByRole("button", { name: "Get Pro" }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect.mock.calls[0][0].code).toBe("pro_yearly");
    expect(onSelect.mock.calls[0][1].code).toBe("pro");
  });

  it("checks out the selected interval's plan code", async () => {
    const data = catalog();
    const createCheckout = vi.fn().mockResolvedValue({ type: "completed", status: "succeeded" });
    render(
      <BillingProvider publishableKey="pk_browser" createCheckout={createCheckout}>
        <PricingTable plans={data.plans} families={data.families} returnUrl="https://merchant.example/pricing" />
      </BillingProvider>,
    );
    fireEvent.click(intervalButton(/Annual/));
    fireEvent.click(within(card("starter")).getByRole("button", { name: "Get Starter" }));
    await waitFor(() => expect(createCheckout).toHaveBeenCalledOnce());
    expect(createCheckout).toHaveBeenCalledWith({
      planCode: "starter_yearly",
      returnUrl: "https://merchant.example/pricing",
    });
  });

  it("starts on defaultInterval and hides the switch with showToggle false", () => {
    const data = catalog();
    render(<PricingTable plans={data.plans} families={data.families} defaultInterval="annual" />);
    expect(intervalButton(/Annual/).getAttribute("aria-pressed")).toBe("true");
    expect(card("pro").getAttribute("data-plan-code")).toBe("pro_yearly");
    cleanup();
    const { rerender } = render(<PricingTable plans={data.plans} families={data.families} showToggle={false} defaultInterval="yearly" />);
    expect(intervalLabels()).toEqual([]);
    expect(card("pro").getAttribute("data-plan-code")).toBe("pro_yearly");
    rerender(<PricingTable plans={data.plans} families={data.families} showToggle={false} />);
    expect(card("pro").getAttribute("data-plan-code")).toBe("pro_monthly");
  });

  it("hides the switch when only one interval exists", () => {
    render(
      <PricingTable
        plans={[plan("a_y", { interval: "yearly", amount_cents: 12000 })]}
        families={[family("a", ["a_y"])]}
      />,
    );
    expect(intervalLabels()).toEqual([]);
    expect(within(card("a")).getByText("$10")).toBeTruthy();
    expect(within(card("a")).getByText("Billed $120 yearly")).toBeTruthy();
  });

  it("uses annualDiscountLabel instead of the computed saving on the Annual option", () => {
    const data = catalog();
    render(<PricingTable plans={data.plans} families={data.families} annualDiscountLabel="2 months free" />);
    expect(intervalLabels()).toEqual(["Monthly", "Annual2 months free"]);
    expect(intervalButton("Annual, 2 months free")).toBeTruthy();
    expect(screen.queryByText("Save 17%")).toBeNull();
  });

  it("shows no saving on an option when no family saves", () => {
    render(
      <PricingTable
        plans={[plan("m", { amount_cents: 1000 }), plan("y", { interval: "yearly", amount_cents: 12000 })]}
        families={[family("f", ["m", "y"])]}
      />,
    );
    expect(intervalLabels()).toEqual(["Monthly", "Annual"]);
  });

  it("formats JPY cards and the locale prop, and survives a malformed locale", () => {
    const jpy = {
      plans: [plan("m", { amount_cents: 1500, amount_currency: "JPY" })],
      families: [family("jp", ["m"])],
    };
    render(<PricingTable {...jpy} />);
    expect(within(card("jp")).getByText("¥1,500")).toBeTruthy();
    cleanup();
    render(
      <PricingTable
        locale="de-DE"
        plans={[plan("m", { amount_cents: 123456, amount_currency: "EUR" })]}
        families={[family("eu", ["m"])]}
      />,
    );
    expect(within(card("eu")).getByText(/1\.234,56\s€/)).toBeTruthy();
    cleanup();
    const data = catalog();
    render(<PricingTable locale="en_US" plans={data.plans} families={data.families} />);
    expect(listItems("pro")).toEqual(["Projects: 20Active projects"]);
    expect(within(card("pro")).getByText("$49")).toBeTruthy();
  });

  it("shows Custom and Contact Sales for a family listed in contactSalesPlans", () => {
    const onSelect = vi.fn();
    const plans = [plan("ent_m", { name: "Enterprise Monthly", amount_cents: 0 })];
    const families = [family("enterprise", ["ent_m"], { name: "Enterprise" })];
    const { rerender } = render(<PricingTable plans={plans} families={families} onSelect={onSelect} />);
    // Never by its name.
    expect(within(card("enterprise")).queryByText("Custom")).toBeNull();
    rerender(<PricingTable plans={plans} families={families} contactSalesPlans={["enterprise"]} onSelect={onSelect} />);
    expect(within(card("enterprise")).getByText("Custom")).toBeTruthy();
    fireEvent.click(within(card("enterprise")).getByRole("button", { name: "Contact Sales" }));
    expect(onSelect).toHaveBeenCalledOnce();
    rerender(<PricingTable plans={plans} families={families} contactSalesPlans={["ent_m"]} onSelect={onSelect} />);
    expect(within(card("enterprise")).getByText("Custom")).toBeTruthy();
  });

  it("lets highlightLabel replace the family badge, or hide it with null", () => {
    const data = catalog();
    data.families![1].badge_text = "Best value";
    const { rerender } = render(<PricingTable plans={data.plans} families={data.families} highlightLabel="Our pick" />);
    expect(within(card("pro")).getByText("Our pick")).toBeTruthy();
    expect(screen.queryByText("Best value")).toBeNull();
    rerender(<PricingTable plans={data.plans} families={data.families} highlightLabel={null} />);
    expect(card("pro").getAttribute("data-highlighted")).toBe("true");
    expect(screen.queryByText("Best value")).toBeNull();
  });

  it("renders family cards in a theme's panel layout with the billing line", () => {
    const data = catalog();
    render(
      <PricingTable
        plans={data.plans}
        families={data.families}
        defaultInterval="yearly"
        onSelect={() => undefined}
        appearance={{ planCardLayout: "panel" }}
      />,
    );
    expect(cardKeys()).toEqual(["starter", "pro", "team"]);
    expect(card("pro").getAttribute("data-plan-code")).toBe("pro_yearly");
    expect(within(card("pro")).getByText("Billed $490 yearly · save 17%")).toBeTruthy();
    expect(within(card("pro")).getByText("Most Popular")).toBeTruthy();
    expect(listItems("pro")).toEqual(["Projects: 40Active projects"]);
  });

  it("loads plans and families from the catalog", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...catalog(), meta: {} })));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <BillingProvider publishableKey="pk_contract">
        <PricingTable onSelect={() => undefined} />
      </BillingProvider>,
    );
    await screen.findByRole("heading", { name: "Pro" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.nozle.app/engine/api/v1/plans");
    expect(cardKeys()).toEqual(["starter", "pro", "team"]);
    expect(within(card("pro")).getByText("Active projects")).toBeTruthy();
  });
});

describe("PricingTable without families (older APIs)", () => {
  const monthlyAndYearly: PricingPlan[] = [
    plan("starter", { amount_cents: 1000 }),
    plan("starter_yearly", { name: "Starter Yearly", interval: "yearly", amount_cents: 10000 }),
    plan("pro", { amount_cents: 5000 }),
    plan("pro_yearly", { name: "Pro Yearly", interval: "yearly", amount_cents: 50000 }),
  ];

  it("shows each plan as a card and filters by the selected interval", () => {
    render(<PricingTable plans={monthlyAndYearly} onSelect={() => undefined} />);
    expect(cardKeys()).toEqual(["starter", "pro"]);
    expect(intervalLabels()).toEqual(["Monthly", "Annual"]);
    fireEvent.click(intervalButton(/Annual/));
    expect(cardKeys()).toEqual(["starter_yearly", "pro_yearly"]);
    expect(within(card("pro_yearly")).getByText("Billed $500 yearly")).toBeTruthy();
  });

  it("shows every plan, cheapest first, when the switch is hidden", () => {
    render(<PricingTable plans={monthlyAndYearly} showToggle={false} />);
    expect(cardKeys()).toEqual(["starter", "pro", "starter_yearly", "pro_yearly"]);
  });

  it("aligns a features array to the rendered cards", () => {
    render(
      <PricingTable
        plans={monthlyAndYearly}
        features={[["first"], ["second"]]}
        onSelect={() => undefined}
      />,
    );
    expect(listItems("starter")).toEqual(["first"]);
    expect(listItems("pro")).toEqual(["second"]);
    fireEvent.click(intervalButton(/Annual/));
    expect(listItems("starter_yearly")).toEqual(["first"]);
    expect(listItems("pro_yearly")).toEqual(["second"]);
  });

  it("aligns a features array to the family cards, whatever the interval", () => {
    const data = catalog();
    render(<PricingTable plans={data.plans} families={data.families} features={[["s"], ["p"]]} />);
    expect(listItems("starter")).toEqual(["s"]);
    expect(listItems("pro")).toEqual(["p"]);
    fireEvent.click(intervalButton(/Annual/));
    expect(listItems("pro")).toEqual(["p"]);
    expect(listItems("team")).toEqual([]);
  });

  it("renders a plain catalog as before, hiding plans pending deletion", () => {
    const legacy = [
      { code: "free", name: "Free", amount_cents: 0, amount_currency: "USD", interval: "monthly" },
      { code: "pro", name: "Pro", amount_cents: 5000, amount_currency: "USD", interval: "monthly", description: "For teams" },
      { code: "gone", name: "Gone", amount_cents: 5000, amount_currency: "USD", interval: "monthly", pending_deletion: true },
    ];
    render(<PricingTable plans={legacy} features={{ pro: ["Unlimited projects"] }} onSelect={() => undefined} />);
    expect(cardKeys()).toEqual(["free", "pro"]);
    expect(listItems("pro")).toEqual(["Unlimited projects"]);
    expect(listItems("free")).toEqual([]);
    expect(document.querySelector('[data-highlighted="true"]')).toBeNull();
    expect(intervalLabels()).toEqual([]);
    expect(within(card("pro")).getByText("$50")).toBeTruthy();
    expect(within(card("pro")).getByText("For teams")).toBeTruthy();
    expect(within(card("pro")).getByRole("button", { name: "Get Pro" })).toBeTruthy();
  });

  it("derives features from fetched plan entitlements", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            plans: [
              {
                code: "pro",
                name: "Pro",
                amount_cents: 4900,
                amount_currency: "USD",
                interval: "monthly",
                entitlements: [
                  { feature_type: "metered", code: "seats", name: "Seats", description: "Never shown", usage_limit: 25, privileges: [] },
                  { feature_type: "boolean", code: "api", name: "API", privileges: [] },
                ],
              },
            ],
          }),
        ),
      ),
    );
    render(
      <BillingProvider publishableKey="pk_contract">
        <PricingTable onSelect={() => undefined} highlightPlan="pro" />
      </BillingProvider>,
    );
    await screen.findByRole("heading", { name: "Pro" });
    expect(listItems("pro")).toEqual(["25 Seats", "API"]);
    expect(screen.queryByText("Never shown")).toBeNull();
    expect(card("pro").getAttribute("data-highlighted")).toBe("true");
  });
});

describe("formatMinorAmount trimZeroFraction", () => {
  it("keeps fractions by default and trims only whole amounts when asked", () => {
    expect(formatMinorAmount(2000, "USD")).toBe("$20.00");
    expect(formatMinorAmount(2000, "USD", "en-US", { trimZeroFraction: true })).toBe("$20");
    expect(formatMinorAmount(2050, "USD", "en-US", { trimZeroFraction: true })).toBe("$20.50");
    expect(formatMinorAmount(1500, "JPY", "en-US", { trimZeroFraction: true })).toBe("¥1,500");
    expect(formatMinorAmount(-2000, "USD", "en-US", { trimZeroFraction: true })).toBe("-$20");
  });
});
