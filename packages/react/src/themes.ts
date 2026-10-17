/**
 * Predefined themes for `appearance={{ theme }}`. Colour themes (`light`, `dark`) and shape themes
 * (`minimal`, `neobrutal`) stack: `theme: [neobrutal, dark]`. Any variable can be changed on top.
 * `nozle` and `nozleDark` are the complete Nozle dashboard look, colours and shape together.
 */
import { LIGHT, type Theme, type Variables } from "./appearance/tokens.js";

export type { Appearance, Elements, ElementKey, Theme, Variables } from "./appearance/tokens.js";

const DARK_COLORS = {
  colorPrimary: "#818cf8",
  colorPrimaryForeground: "#0b1020",
  colorBackground: "#0b0f19",
  colorCard: "#111827",
  colorForeground: "#f3f4f6",
  colorMuted: "#1f2937",
  colorMutedForeground: "#9ca3af",
  colorAccent: "#1e1b4b",
  colorAccentForeground: "#c7d2fe",
  colorBorder: "#374151",
  colorDanger: "#f87171",
  colorWarning: "#fbbf24",
  colorSuccess: "#4ade80",
} satisfies Variables;

type ColorName = keyof typeof DARK_COLORS;
const COLOR_NAMES = Object.keys(DARK_COLORS) as ColorName[];

/** The default look, written out so it can be stacked over another theme. */
export const light: Theme = {
  variables: { ...Object.fromEntries(COLOR_NAMES.map((name) => [name, LIGHT[name]])), colorScheme: "light" },
};

/** Dark surfaces. Put it on a dark page background. */
export const dark: Theme = {
  variables: { ...DARK_COLORS, shadow: "0 1px 3px rgba(0,0,0,0.5)", colorScheme: "dark" },
};

/** Flat: no shadows, small corners, a near-black primary. */
export const minimal: Theme = {
  variables: { colorPrimary: "#111827", colorPrimaryForeground: "#ffffff", shadow: "none", borderRadius: "6px" },
};

/** Thick borders, square corners and a hard offset shadow in the border colour. */
export const neobrutal: Theme = {
  variables: {
    colorPrimary: "#facc15",
    colorPrimaryForeground: "#000000",
    colorBorder: "#000000",
    borderWidth: "2px",
    borderRadius: "0px",
    shadow: "4px 4px 0 var(--nozle-border, #000000)",
  },
};

// Nozle dashboard tokens (nozle-frontend design system and its plan page): flat panels with
// hairline borders, pill buttons, and depth only on the primary action, as a hard ink offset.
const NOZLE_INK = "hsl(138 53% 8%)";
const nozleCta = { fontWeight: 800, fontSize: "14px", padding: "0.625rem 1.5rem" };

/**
 * The Nozle dashboard look. The app loads the Nunito and JetBrains Mono fonts; without them the
 * system fonts are used.
 */
export const nozle: Theme = {
  variables: {
    colorPrimary: "hsl(11 90% 45%)",
    colorPrimaryForeground: "#ffffff",
    colorBackground: "hsl(138 30% 94%)",
    colorCard: "#ffffff",
    colorForeground: NOZLE_INK,
    colorMuted: "hsl(138 35% 84%)",
    colorMutedForeground: "hsl(138 20% 28%)",
    colorAccent: "hsl(11 90% 95%)",
    colorAccentForeground: "hsl(11 90% 39%)",
    colorBorder: "hsl(138 25% 78%)",
    colorDanger: "hsl(2 74% 46%)",
    colorWarning: "hsl(38 92% 30%)",
    colorSuccess: "hsl(152 62% 28%)",
    colorSecondary: "#ffffff",
    colorInput: "hsl(138 20% 46%)",
    fontFamily: "'Nunito', system-ui, sans-serif",
    fontFamilyMono: "'JetBrains Mono', ui-monospace, monospace",
    borderRadius: "14px",
    borderWidth: "1px",
    shadow: "none",
    buttonRadius: "9999px",
    buttonBorderWidth: "2px",
    buttonBorderColor: NOZLE_INK,
    buttonShadow: `4px 4px 0 0 ${NOZLE_INK}`,
    colorScheme: "light",
  },
  planCardLayout: "panel",
  elements: {
    pricingTable__grid: { gap: "1rem" },
    planCard__cta: nozleCta,
    checkoutButton: nozleCta,
    upgradeButton: nozleCta,
    checkout__submit: nozleCta,
  },
};

/** The Nozle dashboard's dark (ink) look. Put it on a dark page background. */
export const nozleDark: Theme = {
  variables: {
    ...nozle.variables,
    colorPrimary: "hsl(11 92% 60%)",
    colorPrimaryForeground: "hsl(138 53% 6%)",
    colorBackground: "hsl(138 40% 6%)",
    colorCard: "hsl(138 38% 10%)",
    colorForeground: "hsl(138 20% 94%)",
    colorMuted: "hsl(138 25% 16%)",
    colorMutedForeground: "hsl(138 14% 68%)",
    colorAccent: "hsl(11 60% 16%)",
    colorAccentForeground: "hsl(11 92% 66%)",
    colorBorder: "hsl(138 20% 20%)",
    colorDanger: "hsl(2 78% 64%)",
    colorWarning: "hsl(38 88% 60%)",
    colorSuccess: "hsl(152 55% 55%)",
    colorSecondary: "hsl(138 38% 10%)",
    colorInput: "hsl(138 16% 44%)",
    buttonBorderColor: "hsl(138 45% 3%)",
    buttonShadow: "4px 4px 0 0 hsl(138 45% 3%)",
    colorScheme: "dark",
  },
  planCardLayout: "panel",
  elements: nozle.elements,
};
