import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { BillingProvider, PlanCard, PricingTable, UsageMeter } from "../index.js";
import { sanitizeSavedAppearance } from "../appearance/saved.js";
import { dark, neobrutal, nozle } from "../themes.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("sanitizeSavedAppearance", () => {
  it("keeps a valid config and maps the theme name to the bundled theme", () => {
    const saved = sanitizeSavedAppearance({
      theme: "nozle",
      variables: { colorPrimary: "#e0482b", colorCard: "#fff", borderRadius: "12px", buttonBorderWidth: "2.5px" },
      planCardLayout: "panel",
      pricingTable: { highlightStyle: "filled", highlightLabel: " Most popular ", annualDiscountLabel: "Save 20%", showToggle: false },
    });
    expect(saved.appearance).toEqual({
      theme: nozle,
      variables: { colorPrimary: "#e0482b", colorCard: "#fff", borderRadius: "12px", buttonBorderWidth: "2.5px" },
      planCardLayout: "panel",
    });
    expect(saved.pricingTable).toEqual({
      highlightStyle: "filled",
      highlightLabel: "Most popular",
      annualDiscountLabel: "Save 20%",
      showToggle: false,
    });
  });

  it("gives nothing for empty, null, array and non-object input", () => {
    for (const raw of [{}, null, undefined, [], "x", 3]) {
      expect(sanitizeSavedAppearance(raw)).toEqual({ pricingTable: {}, components: {} });
    }
  });

  it("drops each invalid part and keeps the rest", () => {
    const saved = sanitizeSavedAppearance({
      theme: "constructor",
      unknownKey: 1,
      variables: {
        colorPrimary: "red",
        colorCard: "#12",
        colorMuted: "#abcd",
        colorDanger: "javascript:alert(1)",
        colorBorder: "url(http://x)",
        colorInput: "var(--x)",
        fontFamily: "Comic Sans",
        buttonShadow: "4px 4px 0 #000",
        borderRadius: "calc(1px + 2px)",
        borderWidth: "1234px",
        buttonRadius: "12",
        buttonBorderWidth: 2,
        colorSuccess: "#16a34a",
      },
      planCardLayout: "grid",
      pricingTable: { highlightStyle: "bold", highlightLabel: 5, annualDiscountLabel: "a\nb", showToggle: "yes" },
    });
    expect(saved.appearance).toEqual({ variables: { colorSuccess: "#16a34a" } });
    expect(saved.pricingTable).toEqual({});
  });

  it("rejects strings over 40 characters, control characters and an oversize document", () => {
    expect(sanitizeSavedAppearance({ pricingTable: { highlightLabel: "x".repeat(41) } }).pricingTable).toEqual({});
    expect(sanitizeSavedAppearance({ pricingTable: { highlightLabel: "x".repeat(40) } }).pricingTable.highlightLabel).toHaveLength(40);
    expect(sanitizeSavedAppearance({ pricingTable: { highlightLabel: "a\u0007b" } }).pricingTable).toEqual({});
    expect(sanitizeSavedAppearance({ theme: "dark", pad: "x".repeat(9000) })).toEqual({ pricingTable: {}, components: {} });
  });

  it("reads each component's own settings and ignores unknown components and empty entries", () => {
    const saved = sanitizeSavedAppearance({
      theme: "dark",
      components: {
        UsageMeter: { variables: { colorPrimary: "#e0482b", colorCard: "red" }, theme: "neobrutal" },
        PricingTable: { pricingTable: { highlightStyle: "filled" } },
        CreditBalance: {},
        Checkout: { theme: "dark" },
        PlanCard: "x",
      },
    });
    expect(Object.keys(saved.components).sort()).toEqual(["PricingTable", "UsageMeter"]);
    expect(saved.components.UsageMeter?.appearance).toEqual({ theme: neobrutal, variables: { colorPrimary: "#e0482b" } });
    expect(saved.components.PricingTable?.pricingTable).toEqual({ highlightStyle: "filled" });
  });

  it("keeps an empty highlight label, which means no label", () => {
    expect(sanitizeSavedAppearance({ pricingTable: { highlightLabel: "" } }).pricingTable).toEqual({ highlightLabel: "" });
  });
});

const plans = [
  { code: "free", name: "Free", amount_cents: 0, amount_currency: "USD", interval: "monthly" },
  { code: "pro", name: "Pro", amount_cents: 2900, amount_currency: "USD", interval: "monthly" },
  { code: "scale", name: "Scale", amount_cents: 9900, amount_currency: "USD", interval: "monthly" },
];

function stubCatalog(sdkAppearance?: unknown, status = 200) {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ plans, meta: { nozle_branding: false, ...(sdkAppearance !== undefined && { sdk_appearance: sdkAppearance }) } }), { status }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const Provider = ({ children, ...props }: Partial<React.ComponentProps<typeof BillingProvider>>) => (
  <BillingProvider publishableKey="pk_test" baseUrl="http://core.test" {...props}>
    {children}
  </BillingProvider>
);

// Custom properties the root itself declares (not the var() reads in its styles).
const declared = () => Array.from({ length: meter().style.length }, (_, i) => meter().style.item(i)).filter((name) => name.startsWith("--nozle-"));
const meter = () => document.querySelector(".nozle-usageMeter") as HTMLElement;

describe("BillingProvider saved appearance", () => {
  it("applies the saved theme and variables to a component through the catalog request", async () => {
    stubCatalog({ theme: "dark", variables: { colorPrimary: "#e0482b" } });
    render(<Provider><UsageMeter used={5} limit={10} label="Seats" /></Provider>);
    await waitFor(() => expect(meter().style.getPropertyValue("--nozle-primary")).toBe("#e0482b"));
    expect(meter().style.getPropertyValue("--nozle-card")).toBe(dark.variables?.colorCard);
  });

  it("ranks saved below the provider appearance below the component appearance", async () => {
    stubCatalog({ variables: { colorPrimary: "#111111", colorCard: "#111111", colorBorder: "#111111" } });
    render(
      <Provider appearance={{ variables: { colorPrimary: "#222222", colorCard: "#222222" } }}>
        <UsageMeter used={5} limit={10} label="Seats" appearance={{ variables: { colorPrimary: "#333333" } }} />
      </Provider>,
    );
    await waitFor(() => expect(meter().style.getPropertyValue("--nozle-border")).toBe("#111111"));
    expect(meter().style.getPropertyValue("--nozle-card")).toBe("#222222");
    expect(meter().style.getPropertyValue("--nozle-primary")).toBe("#333333");
  });

  it("applies a component's own saved settings to that component only, below code", async () => {
    stubCatalog({
      variables: { colorPrimary: "#111111", colorBorder: "#111111" },
      components: { UsageMeter: { variables: { colorPrimary: "#444444", colorBorder: "#444444" } } },
    });
    render(
      <Provider appearance={{ variables: { colorBorder: "#222222" } }}>
        <UsageMeter used={5} limit={10} label="Seats" />
        <PlanCard plan={plans[1]!} onSelect={() => undefined} />
      </Provider>,
    );
    await waitFor(() => expect(meter().style.getPropertyValue("--nozle-primary")).toBe("#444444"));
    // Code (the provider prop) still beats the component's saved border.
    expect(meter().style.getPropertyValue("--nozle-border")).toBe("#222222");
    const card = document.querySelector(".nozle-planCard") as HTMLElement;
    expect(card.style.getPropertyValue("--nozle-primary")).toBe("#111111");
  });

  it("never fetches or applies it with savedAppearance={false}", async () => {
    const fetchMock = stubCatalog({ variables: { colorPrimary: "#e0482b" } });
    render(<Provider savedAppearance={false}><UsageMeter used={5} limit={10} label="Seats" /></Provider>);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(meter().style.getPropertyValue("--nozle-primary")).toBe("");
  });

  it("writes no variables when nothing is saved or the request fails", async () => {
    const fetchMock = stubCatalog({});
    render(<Provider><UsageMeter used={5} limit={10} label="Seats" /></Provider>);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(declared()).toEqual([]);
    cleanup();

    const failing = stubCatalog(undefined, 500);
    render(<Provider><UsageMeter used={5} limit={10} label="Seats" /></Provider>);
    await waitFor(() => expect(failing).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(failing).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(declared()).toEqual([]);
  });

  it("makes one /plans request when PricingTable and another component share the provider", async () => {
    const fetchMock = stubCatalog({ theme: "neobrutal" });
    render(
      <Provider>
        <UsageMeter used={5} limit={10} label="Seats" />
        <PricingTable showToggle={false} onSelect={() => {}} />
      </Provider>,
    );
    await screen.findByRole("heading", { name: "Pro" });
    await waitFor(() => expect(meter().style.getPropertyValue("--nozle-border-width")).toBe("2px"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fills PricingTable defaults from the saved options, and props win", async () => {
    const saved = {
      planCardLayout: "panel",
      pricingTable: { highlightStyle: "filled", highlightLabel: "Top pick", annualDiscountLabel: "Two months free", showToggle: false },
    };
    stubCatalog(saved);
    const { unmount } = render(
      <Provider><PricingTable highlightPlan="pro" onSelect={() => {}} /></Provider>,
    );
    await screen.findByText("Top pick");
    const card = screen.getByRole("heading", { name: "Pro" }).closest(".nozle-planCard") as HTMLElement;
    expect(card.style.background).toContain("--nozle-highlight");
    expect(screen.queryByRole("group", { name: "Billing interval" })).toBeNull();
    expect(document.querySelector(".nozle-planCard__header")).not.toBeNull();
    unmount();

    stubCatalog(saved);
    render(
      <Provider>
        <PricingTable highlightPlan="pro" highlightStyle="outline" highlightLabel="Mine" onSelect={() => {}} />
      </Provider>,
    );
    await screen.findByText("Mine");
    expect(screen.queryByText("Top pick")).toBeNull();
    const own = screen.getByRole("heading", { name: "Pro" }).closest(".nozle-planCard") as HTMLElement;
    expect(own.style.background).toContain("--nozle-card");
  });

  it("shows no badge for a saved empty highlight label", async () => {
    stubCatalog({ pricingTable: { highlightLabel: "" } });
    render(<Provider><PricingTable highlightPlan="pro" showToggle={false} onSelect={() => {}} /></Provider>);
    await screen.findByRole("heading", { name: "Pro" });
    expect(screen.queryByText("Most Popular")).toBeNull();
  });
});

describe("plan button states", () => {
  const SHADOW = "--nozle-button-shadow";
  const buttons = () => [...document.querySelectorAll<HTMLElement>(".nozle-planCard__cta")];
  const style = (label: string) => buttons().find((b) => b.textContent === label)!.getAttribute("style")!;
  const table = (props: Partial<React.ComponentProps<typeof PricingTable>>, theme = nozle) =>
    render(<PricingTable plans={plans} showToggle={false} onSelect={() => {}} appearance={{ theme }} {...props} />);

  it("gives every paid plan the primary button, with the theme shadow, when there is no current plan", () => {
    table({});
    for (const label of ["Get Free", "Get Pro", "Get Scale"]) {
      expect(style(label)).toContain(SHADOW);
      expect(style(label)).toContain("var(--nozle-primary");
    }
  });

  it("keeps the highlight colours on the highlighted plan", () => {
    table({ highlightPlan: "pro" });
    expect(style("Get Pro")).toContain("--nozle-highlight");
    expect(style("Get Scale")).not.toContain("--nozle-highlight");
  });

  for (const layout of ["panel", "card"] as const) {
    it(`with a current plan: above is primary, current is primary without shadow, below is secondary (${layout})`, () => {
      table({ currentPlanCode: "pro", appearance: { theme: nozle, planCardLayout: layout } });
      expect(style("Get Scale")).toContain(SHADOW);
      expect(style("Current Plan")).not.toContain(SHADOW);
      expect(style("Current Plan")).toContain("var(--nozle-primary");
      expect(style("Get Free")).not.toContain(SHADOW);
      expect(style("Get Free")).toContain("--nozle-input");
      const label = layout === "panel" ? screen.getByText("Active") : screen.getByText("Current Plan", { selector: ".nozle-planCard__badge" });
      expect(label).toBeTruthy();
    });
  }

  it("makes a highlighted plan below the current one secondary", () => {
    table({ currentPlanCode: "scale", highlightPlan: "free" });
    expect(style("Get Free")).not.toContain(SHADOW);
    expect(style("Get Free")).not.toContain("--nozle-highlight");
  });

  it("works with neobrutal and gives light no shadow variable", () => {
    const { unmount } = table({}, neobrutal);
    expect(document.querySelector<HTMLElement>(".nozle-pricingTable")!.style.getPropertyValue("--nozle-button-shadow")).toBe("3px 3px 0 #000000");
    expect(style("Get Pro")).toContain(SHADOW);
    unmount();
    render(<PricingTable plans={plans} showToggle={false} onSelect={() => {}} />);
    expect(document.querySelector<HTMLElement>(".nozle-pricingTable")!.style.getPropertyValue("--nozle-button-shadow")).toBe("");
  });

  it("applies the same states to PlanCard", () => {
    const pro = plans[1];
    const { unmount } = render(<PlanCard plan={pro} isCurrent={false} onSelect={() => {}} appearance={{ theme: nozle }} />);
    expect(style("Get Started")).toContain(SHADOW);
    unmount();
    const current = render(<PlanCard plan={pro} isCurrent onSelect={() => {}} appearance={{ theme: nozle }} />);
    expect(style("Current Plan")).not.toContain(SHADOW);
    expect(style("Current Plan")).toContain("var(--nozle-primary");
    current.unmount();
    render(<PlanCard plan={pro} isCurrent={false} isUpgrade={false} onSelect={() => {}} appearance={{ theme: nozle }} />);
    expect(style("Get Started")).not.toContain(SHADOW);
    expect(style("Get Started")).toContain("--nozle-input");
  });
});
