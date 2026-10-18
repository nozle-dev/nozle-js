import { dark, light, minimal, neobrutal, nozle, nozleDark } from "../themes.js";
import type { Appearance, Theme, Variables } from "./tokens.js";

/** What the dashboard saves for the organisation: `meta.sdk_appearance` of `GET /api/v1/plans`. */
export interface SavedPricingTable {
  highlightStyle?: "outline" | "filled";
  /** "" means no label. */
  highlightLabel?: string;
  annualDiscountLabel?: string;
  showToggle?: boolean;
}

export interface SavedAppearance {
  /** Theme, variables and card layout, ready to be the lowest `mergeAppearance` layer. */
  appearance?: Appearance;
  pricingTable: SavedPricingTable;
}

const THEMES: Record<string, Theme> = { light, dark, minimal, neobrutal, nozle, nozleDark };

const COLOR_KEYS = [
  "colorPrimary", "colorPrimaryForeground", "colorBackground", "colorCard", "colorForeground",
  "colorMuted", "colorMutedForeground", "colorAccent", "colorAccentForeground", "colorBorder",
  "colorDanger", "colorWarning", "colorSuccess", "colorSecondary", "colorInput",
  "colorHighlight", "colorHighlightForeground", "buttonBorderColor",
] as const;
const LENGTH_KEYS = ["borderRadius", "buttonRadius", "borderWidth", "buttonBorderWidth"] as const;

const COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const LENGTH = /^\d{1,3}(\.\d+)?(px|rem|em)$/;
const MAX_JSON = 4096;
const MAX_STRING = 40;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A trimmed string of at most 40 characters without control characters, else undefined. */
function label(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  // eslint-disable-next-line no-control-regex
  return text.length <= MAX_STRING && !/[\u0000-\u001f\u007f-\u009f]/.test(text) ? text : undefined;
}

/**
 * Reads the saved appearance with the closed schema Core enforces, dropping every part that does not
 * fit. Never throws: anything unusable gives an empty result and the components look as before.
 */
export function sanitizeSavedAppearance(raw: unknown): SavedAppearance {
  const out: SavedAppearance = { pricingTable: {} };
  try {
    if (!isObject(raw) || JSON.stringify(raw).length > MAX_JSON) return out;

    const appearance: Appearance = {};
    if (typeof raw.theme === "string" && Object.hasOwn(THEMES, raw.theme)) appearance.theme = THEMES[raw.theme];

    if (isObject(raw.variables)) {
      const variables: Record<string, string> = {};
      for (const [keys, pattern] of [[COLOR_KEYS, COLOR], [LENGTH_KEYS, LENGTH]] as const) {
        for (const key of keys) {
          const value = raw.variables[key];
          if (typeof value === "string" && pattern.test(value)) variables[key] = value;
        }
      }
      if (Object.keys(variables).length) appearance.variables = variables as Variables;
    }

    if (raw.planCardLayout === "card" || raw.planCardLayout === "panel") appearance.planCardLayout = raw.planCardLayout;
    if (Object.keys(appearance).length) out.appearance = appearance;

    if (isObject(raw.pricingTable)) {
      const table = raw.pricingTable;
      const pricing = out.pricingTable;
      if (table.highlightStyle === "outline" || table.highlightStyle === "filled") pricing.highlightStyle = table.highlightStyle;
      const highlightLabel = label(table.highlightLabel);
      if (highlightLabel !== undefined) pricing.highlightLabel = highlightLabel;
      const annual = label(table.annualDiscountLabel);
      if (annual) pricing.annualDiscountLabel = annual;
      if (typeof table.showToggle === "boolean") pricing.showToggle = table.showToggle;
    }
  } catch {
    return { pricingTable: {} };
  }
  return out;
}
