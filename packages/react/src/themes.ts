/**
 * Predefined themes for `appearance={{ theme }}`. Colour themes (`light`, `dark`) and shape themes
 * (`minimal`, `neobrutal`) stack: `theme: [neobrutal, dark]`. Any variable can be changed on top.
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
