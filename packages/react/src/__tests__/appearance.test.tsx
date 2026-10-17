import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BillingProvider, CreditBalance, PricingTable, UsageMeter } from "../index.js";
import * as themes from "../themes.js";
import { dark, light, neobrutal } from "../themes.js";
import { mergeAppearance, T, text, toCssVars } from "../appearance/tokens.js";
import { toStripeAppearance } from "../components/billing/Checkout.js";

const balance = { credit_system_name: "AI credits", unit_name: "credit", available: "120", as_of: "2026-10-01T00:00:00Z" };

describe("mergeAppearance", () => {
  it("applies themes in order, then the layer's own variables, provider first and instance last", () => {
    const merged = mergeAppearance(
      { theme: [neobrutal, dark], variables: { colorPrimary: "#111" } },
      { theme: light, variables: { borderRadius: "4px" } },
    );
    expect(merged.variables.colorPrimary).toBe(light.variables?.colorPrimary);
    expect(merged.variables.borderWidth).toBe("2px");
    expect(merged.variables.borderRadius).toBe("4px");
    expect(merged.variables.colorScheme).toBe("light");
  });

  it("joins element class names and merges element styles", () => {
    const merged = mergeAppearance(
      { elements: { planCard: "a", planCard__cta: { color: "red" } } },
      { elements: { planCard: "b", planCard__cta: { fontWeight: 700 } } },
    );
    expect(merged.elements.planCard?.className).toBe("a b");
    expect(merged.elements.planCard__cta?.style).toEqual({ color: "red", fontWeight: 700 });
  });
});

describe("toCssVars", () => {
  it("names each variable as a --nozle-* custom property", () => {
    expect(toCssVars({ colorDanger: "#f00", borderRadius: "0px", colorScheme: "dark" })).toEqual({
      "--nozle-destructive": "#f00",
      "--nozle-radius": "0px",
      colorScheme: "dark",
    });
    expect(toCssVars({ colorSecondary: "#fff", colorInput: "#999", labelFont: "600 12px serif", labelTextTransform: "uppercase" })).toEqual({
      "--nozle-secondary": "#fff",
      "--nozle-input": "#999",
      "--nozle-label-font": "600 12px serif",
      "--nozle-label-transform": "uppercase",
    });
    expect(toCssVars({ buttonRadius: "10px", buttonBorderWidth: "2px", buttonBorderColor: "#000", buttonShadow: "none" })).toEqual({
      "--nozle-button-radius": "10px",
      "--nozle-button-border-width": "2px",
      "--nozle-button-border": "#000",
      "--nozle-button-shadow": "none",
    });
    expect(
      toCssVars({
        fontTitle: "700 20px serif",
        fontHeading: "600 16px serif",
        fontMetric: "700 28px serif",
        fontBody: "400 14px serif",
        fontMeta: "400 12px serif",
        fontAction: "600 14px serif",
      }),
    ).toEqual({
      "--nozle-font-title": "700 20px serif",
      "--nozle-font-heading": "600 16px serif",
      "--nozle-font-metric": "700 28px serif",
      "--nozle-font-body": "400 14px serif",
      "--nozle-font-meta": "400 12px serif",
      "--nozle-font-action": "600 14px serif",
    });
  });

  it("gives each text role a default in the theme's font, the metric in the numbers font", () => {
    expect(T.fontBody).toBe(`var(--nozle-font-body, 400 14px/1.5 ${T.font})`);
    expect(T.fontMetric).toBe(`var(--nozle-font-metric, 700 28px/1.1 var(--nozle-font-numbers, ${T.font}))`);
    expect(text.secondary).toEqual({ font: T.fontBody, color: T.mutedForeground });
    expect(text.action).not.toHaveProperty("color");
  });

  it("derives muted text from the text and card colours unless colorMutedForeground is set", () => {
    expect(T.mutedForeground).toBe(`var(--nozle-muted-foreground, var(--nozle-portal-muted, color-mix(in srgb, ${T.foreground} 62%, ${T.card})))`);
    expect(toCssVars({ colorMutedForeground: "#777" })).toEqual({ "--nozle-muted-foreground": "#777" });
  });

  it("falls back to an old variable name and then to the light value", () => {
    expect(T.primary).toBe("var(--nozle-primary, var(--nozle-pricing-highlight, var(--nozle-portal-accent, #4f46e5)))");
  });
});

describe("themes", () => {
  it("offers exactly light, dark, minimal, neobrutal, nozle and nozleDark", () => {
    expect(Object.keys(themes).sort()).toEqual(["dark", "light", "minimal", "neobrutal", "nozle", "nozleDark"]);
  });

  it("gives nozle panel cards with ACTIVE on the current plan, and the primary button only to plans above it", () => {
    render(
      <PricingTable
        plans={[
          { code: "free", name: "Free", amount_cents: 0, amount_currency: "USD", interval: "monthly" },
          { code: "pro", name: "Pro", amount_cents: 2900, amount_currency: "USD", interval: "monthly" },
          { code: "scale", name: "Scale", amount_cents: 9900, amount_currency: "USD", interval: "monthly" },
        ]}
        currentPlanCode="pro"
        highlightPlan="scale"
        highlightLabel={null}
        showToggle={false}
        onSelect={() => {}}
        appearance={{ theme: themes.nozle }}
      />,
    );
    const root = document.querySelector(".nozle-pricingTable") as HTMLElement;
    expect(root.style.getPropertyValue("--nozle-shadow")).toBe("none");
    expect(root.style.getPropertyValue("--nozle-button-shadow")).toBe("4px 4px 0 0 hsl(138 53% 8%)");
    const header = (name: string) => screen.getByRole("heading", { name }).closest(".nozle-planCard__header") as HTMLElement;
    expect(header("Pro").textContent).toBe("ProActive");
    expect(header("Scale").textContent).toBe("Scale");
    const ctas = [...document.querySelectorAll<HTMLElement>(".nozle-planCard__cta")];
    const style = (text: string) => ctas.find((cta) => cta.textContent === text)!.getAttribute("style")!;
    expect(style("Get Scale")).toContain("var(--nozle-button-shadow, none)");
    expect(style("Get Free")).not.toContain("--nozle-button-shadow");
    expect(style("Get Free")).toContain("--nozle-input");
    expect(root.style.getPropertyValue("--nozle-font-action")).toContain("800 14px/1.4");
    expect(style("Get Free")).toContain("var(--nozle-font-action");
  });
});

describe("PricingTable highlight", () => {
  const plans = [
    { code: "free", name: "Free", amount_cents: 0, amount_currency: "USD", interval: "monthly" },
    { code: "pro", name: "Pro", amount_cents: 2900, amount_currency: "USD", interval: "monthly" },
  ];
  const card = (name: string) => screen.getByRole("heading", { name }).closest(".nozle-planCard") as HTMLElement;

  it("outlines the highlighted card by default, with the badge", () => {
    render(<PricingTable plans={plans} highlightPlan="pro" showToggle={false} onSelect={() => {}} />);
    expect(card("Pro").style.background).toContain("--nozle-card");
    expect(screen.getByText("Most Popular").style.background).toContain("--nozle-highlight");
  });

  it("fills the highlighted card with the highlight colour and swaps its text and button colours", () => {
    render(
      <PricingTable plans={plans} highlightPlan="pro" highlightStyle="filled" highlightLabel="Best value" showToggle={false} onSelect={() => {}} />,
    );
    expect(card("Pro").style.background).toContain("--nozle-highlight");
    expect(card("Pro").style.color).toContain("--nozle-highlight-foreground");
    const cta = screen.getByRole("button", { name: "Get Pro" });
    expect(cta.style.background).toContain("--nozle-highlight-foreground");
    expect(screen.getByText("Best value")).toBeTruthy();
    expect(card("Free").style.background).toContain("--nozle-card");
  });

  it("hides the badge when the label is null", () => {
    render(<PricingTable plans={plans} highlightPlan="pro" highlightLabel={null} showToggle={false} onSelect={() => {}} />);
    expect(screen.queryByText("Most Popular")).toBeNull();
  });
});

describe("components", () => {
  it("writes no variables without an appearance, so app CSS variables keep working", () => {
    render(<UsageMeter used={5} limit={10} label="Seats" />);
    const meter = document.querySelector(".nozle-usageMeter") as HTMLElement;
    expect(meter.style.getPropertyValue("--nozle-primary")).toBe("");
  });

  it("puts the provider theme on each component root, with the instance appearance on top", () => {
    render(
      <BillingProvider publishableKey="pk_test" appearance={{ theme: dark, elements: { creditBalance: "from-provider" } }}>
        <CreditBalance balance={balance} appearance={{ variables: { colorPrimary: "#7c3aed" } }} />
      </BillingProvider>,
    );
    const root = screen.getByRole("region", { name: "AI credits" });
    expect(root.style.getPropertyValue("--nozle-card")).toBe(dark.variables?.colorCard);
    expect(root.style.getPropertyValue("--nozle-primary")).toBe("#7c3aed");
    expect(root.className).toContain("nozle-creditBalance");
    expect(root.className).toContain("from-provider");
  });

  it("recolours secondary text with colorForeground when colorMutedForeground is not set", () => {
    render(<CreditBalance balance={balance} appearance={{ variables: { colorForeground: "#1e3a8a" } }} />);
    const root = screen.getByRole("region", { name: "AI credits" });
    expect(root.style.getPropertyValue("--nozle-foreground")).toBe("#1e3a8a");
    const unit = screen.getByText("credits available").getAttribute("style")!;
    expect(unit).toContain("--nozle-muted-foreground");
    expect(unit).toContain("--nozle-foreground");
  });

  it("applies element class names and styles to the matching inner element", () => {
    render(
      <UsageMeter
        used={5}
        limit={10}
        label="Seats"
        appearance={{ elements: { usageMeter__fill: "my-fill", usageMeter__track: { height: "12px" } } }}
      />,
    );
    expect(document.querySelector(".nozle-usageMeter__fill")?.className).toContain("my-fill");
    expect((document.querySelector(".nozle-usageMeter__track") as HTMLElement).style.height).toBe("12px");
  });
});

describe("toStripeAppearance", () => {
  it("maps resolved colours and picks night for a dark background", () => {
    expect(
      toStripeAppearance({ primary: "rgb(129, 140, 248)", background: "rgb(17, 24, 39)", foreground: "rgb(243, 244, 246)", radius: "12px" }),
    ).toEqual({
      theme: "night",
      variables: { colorPrimary: "rgb(129, 140, 248)", colorBackground: "rgb(17, 24, 39)", colorText: "rgb(243, 244, 246)", borderRadius: "12px" },
    });
  });

  it("uses the stripe theme on a light background and drops colours Stripe cannot read", () => {
    const result = toStripeAppearance({ primary: "oklch(0.5 0.2 270)", background: "rgb(255, 255, 255)" });
    expect(result.theme).toBe("stripe");
    expect(result.variables).toEqual({ colorBackground: "rgb(255, 255, 255)" });
  });
});
