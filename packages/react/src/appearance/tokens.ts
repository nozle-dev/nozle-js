import type { CSSProperties } from "react";

/** Design tokens. Every value is a CSS value, for example `#4f46e5`, `oklch(...)` or `var(--primary)`. */
export interface Variables {
  colorPrimary?: string;
  colorPrimaryForeground?: string;
  colorBackground?: string;
  colorCard?: string;
  colorForeground?: string;
  colorMuted?: string;
  colorMutedForeground?: string;
  colorAccent?: string;
  colorAccentForeground?: string;
  colorBorder?: string;
  colorDanger?: string;
  colorWarning?: string;
  colorSuccess?: string;
  /** Fill of secondary buttons. Defaults to `colorMuted`. */
  colorSecondary?: string;
  /** Border of secondary buttons and other controls. Defaults to `colorBorder`. */
  colorInput?: string;
  /** The highlighted pricing card (`highlightPlan`). Defaults to `colorPrimary`. */
  colorHighlight?: string;
  /** Text on a filled highlighted card. Defaults to `colorPrimaryForeground`. */
  colorHighlightForeground?: string;
  fontFamily?: string;
  /** Font of numbers in tables. Defaults to the surrounding font. */
  fontFamilyNumbers?: string;
  /** CSS `font` shorthand of small labels: table headers and plan card status labels. */
  labelFont?: string;
  /** `text-transform` of small labels, for example `uppercase`. */
  labelTextTransform?: string;
  /** `letter-spacing` of small labels. */
  labelLetterSpacing?: string;
  borderRadius?: string;
  borderWidth?: string;
  shadow?: string;
  /** Corner radius of buttons. Defaults to a fraction of `borderRadius`. */
  buttonRadius?: string;
  /** Border width of buttons. Defaults to `borderWidth`. */
  buttonBorderWidth?: string;
  /** Border colour of primary buttons. Defaults to the button's fill colour. */
  buttonBorderColor?: string;
  /** Shadow of primary buttons only, for example a hard offset. Defaults to none. */
  buttonShadow?: string;
  /** Sets the CSS `color-scheme` of the component, so native controls follow the theme. */
  colorScheme?: "light" | "dark" | "light dark";
}

export type ElementKey =
  | "pricingTable"
  | "pricingTable__toggle"
  | "pricingTable__toggleButton"
  | "pricingTable__grid"
  | "planCard"
  | "planCard__header"
  | "planCard__badge"
  | "planCard__name"
  | "planCard__description"
  | "planCard__price"
  | "planCard__features"
  | "planCard__feature"
  | "planCard__cta"
  | "planComparison"
  | "planComparison__table"
  | "planComparison__row"
  | "planComparison__cell"
  | "creditBalance"
  | "creditBalance__amount"
  | "creditHistory"
  | "creditHistory__table"
  | "creditHistory__row"
  | "usageBreakdown"
  | "usageBreakdown__row"
  | "usageTrend"
  | "usageTrend__bar"
  | "usageMeter"
  | "usageMeter__label"
  | "usageMeter__value"
  | "usageMeter__track"
  | "usageMeter__fill"
  | "usageDashboard"
  | "usageAlert"
  | "usageAlert__dismiss"
  | "currentPlan"
  | "currentPlan__name"
  | "currentPlan__status"
  | "currentPlan__price"
  | "currentPlan__scheduled"
  | "currentPlan__notice"
  | "currentPlan__usage"
  | "currentPlan__details"
  | "planBadge"
  | "paymentMethod"
  | "checkoutButton"
  | "upgradeButton"
  | "checkout"
  | "checkout__submit"
  | "checkout__error"
  | "upgradeModal"
  | "upgradeModal__dialog"
  | "upgradeModal__actions"
  | "upgradePrompt"
  | "lockedOverlay"
  | "lockedOverlay__panel"
  | "billingPortal"
  | "billingPortal__section"
  | "billingPortal__card"
  | "billingPortal__table"
  | "billingPortal__error"
  | "cancellationControl"
  | "planChangeControl";

/** A string adds a class name; an object adds inline styles. */
export type Elements = Partial<Record<ElementKey, string | CSSProperties>>;

export interface Theme {
  variables?: Variables;
  elements?: Elements;
  /**
   * How plan cards are laid out. `card` (default): name, description, price and ticked features.
   * `panel`: the name in a header band with the plan's status on the right, then price,
   * description and plain feature lines.
   */
  planCardLayout?: "card" | "panel";
}

/** A theme (or a stack of themes, last wins) plus your own variables and elements on top. */
export interface Appearance extends Theme {
  theme?: Theme | Theme[];
}

type ColorKey = Exclude<keyof Variables, "colorScheme">;

const CSS_VAR: Record<ColorKey, string> = {
  colorPrimary: "--nozle-primary",
  colorPrimaryForeground: "--nozle-primary-foreground",
  colorBackground: "--nozle-background",
  colorCard: "--nozle-card",
  colorForeground: "--nozle-foreground",
  colorMuted: "--nozle-muted",
  colorMutedForeground: "--nozle-muted-foreground",
  colorAccent: "--nozle-accent",
  colorAccentForeground: "--nozle-accent-foreground",
  colorBorder: "--nozle-border",
  colorDanger: "--nozle-destructive",
  colorWarning: "--nozle-warning",
  colorSuccess: "--nozle-success",
  colorSecondary: "--nozle-secondary",
  colorInput: "--nozle-input",
  colorHighlight: "--nozle-highlight",
  colorHighlightForeground: "--nozle-highlight-foreground",
  fontFamily: "--nozle-font",
  fontFamilyNumbers: "--nozle-font-numbers",
  labelFont: "--nozle-label-font",
  labelTextTransform: "--nozle-label-transform",
  labelLetterSpacing: "--nozle-label-spacing",
  borderRadius: "--nozle-radius",
  borderWidth: "--nozle-border-width",
  shadow: "--nozle-shadow",
  buttonRadius: "--nozle-button-radius",
  buttonBorderWidth: "--nozle-button-border-width",
  buttonBorderColor: "--nozle-button-border",
  buttonShadow: "--nozle-button-shadow",
};

/** The light values every component falls back to when nothing else sets a token. */
// The highlight colours default to the primary colours, and the button values to the general ones
// or to each button's own, so they have no value of their own here.
type DerivedKey =
  | "colorHighlight"
  | "colorHighlightForeground"
  | "colorSecondary"
  | "colorInput"
  | "fontFamilyNumbers"
  | "labelFont"
  | "labelTextTransform"
  | "labelLetterSpacing"
  | "buttonRadius"
  | "buttonBorderWidth"
  | "buttonBorderColor"
  | "buttonShadow";

export const LIGHT: Required<Omit<Variables, "colorScheme" | DerivedKey>> = {
  colorPrimary: "#4f46e5",
  colorPrimaryForeground: "#ffffff",
  colorBackground: "#ffffff",
  colorCard: "#ffffff",
  colorForeground: "#111827",
  colorMuted: "#f3f4f6",
  colorMutedForeground: "#6b7280",
  colorAccent: "#eef2ff",
  colorAccentForeground: "#3730a3",
  colorBorder: "#e5e7eb",
  colorDanger: "#dc2626",
  colorWarning: "#d97706",
  colorSuccess: "#16a34a",
  fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  borderRadius: "12px",
  borderWidth: "1px",
  shadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
};

// Variable names from earlier releases, still read after the --nozle-* name.
const ALIASES: Partial<Record<ColorKey, string[]>> = {
  colorPrimary: ["--nozle-pricing-highlight", "--nozle-portal-accent"],
  colorBackground: ["--nozle-pricing-bg", "--nozle-portal-background"],
  colorCard: ["--nozle-pricing-card-bg"],
  colorForeground: ["--nozle-portal-text"],
  colorMuted: ["--nozle-portal-muted-background"],
  colorMutedForeground: ["--nozle-portal-muted"],
  colorBorder: ["--nozle-pricing-border", "--nozle-portal-border"],
  borderRadius: ["--nozle-pricing-radius"],
};

function chain(key: Exclude<ColorKey, DerivedKey>): string {
  return [CSS_VAR[key], ...(ALIASES[key] ?? [])].reduceRight(
    (fallback, name) => `var(${name}, ${fallback})`,
    LIGHT[key],
  );
}

const soft = (color: string, base: string, percent: number) =>
  `color-mix(in srgb, ${color} ${percent}%, ${base})`;

const primary = chain("colorPrimary");
const card = chain("colorCard");
const danger = chain("colorDanger");
const warning = chain("colorWarning");
const success = chain("colorSuccess");
const foreground = chain("colorForeground");
const primaryForeground = chain("colorPrimaryForeground");

/** CSS values for component styles: each reads its token, then older names, then the light value. */
export const T = {
  primary,
  primaryForeground,
  highlight: `var(--nozle-highlight, ${primary})`,
  highlightForeground: `var(--nozle-highlight-foreground, ${primaryForeground})`,
  background: chain("colorBackground"),
  card,
  foreground,
  muted: chain("colorMuted"),
  mutedForeground: chain("colorMutedForeground"),
  accent: chain("colorAccent"),
  secondary: `var(--nozle-secondary, ${chain("colorMuted")})`,
  input: `var(--nozle-input, ${chain("colorBorder")})`,
  accentForeground: chain("colorAccentForeground"),
  border: chain("colorBorder"),
  danger,
  warning,
  success,
  font: chain("fontFamily"),
  fontNumbers: "var(--nozle-font-numbers, inherit)",
  labelFont: `var(--nozle-label-font, 600 12px/1.4 ${chain("fontFamily")})`,
  labelTransform: "var(--nozle-label-transform, none)",
  labelSpacing: "var(--nozle-label-spacing, normal)",
  radius: chain("borderRadius"),
  borderWidth: chain("borderWidth"),
  shadow: chain("shadow"),
  /** Tinted backgrounds and borders for notices, derived from the matching colour. */
  dangerSoft: soft(danger, card, 10),
  dangerBorder: soft(danger, card, 30),
  warningSoft: soft(warning, card, 12),
  warningBorder: soft(warning, card, 35),
  warningText: soft(warning, foreground, 70),
  successSoft: soft(success, card, 12),
  primarySoft: soft(primary, card, 10),
  primaryHover: soft(primary, "black", 88),
  skeleton: soft(foreground, card, 8),
  /** Table header band and the lighter line between table rows. */
  tableHeader: soft(chain("colorMuted"), card, 50),
  rowLine: soft(chain("colorBorder"), card, 70),
} as const;

/** `border` shorthand using the theme's border width and colour. */
export const border = (color: string = T.border) => `${T.borderWidth} solid ${color}`;

const buttonBorderWidth = `var(--nozle-button-border-width, ${T.borderWidth})`;

/** `border` shorthand for a primary button: `buttonBorderColor` first, then `color`. */
export const primaryButtonBorder = (color: string) => `${buttonBorderWidth} solid var(--nozle-button-border, ${color})`;

/** `border` shorthand for any other button. */
export const buttonBorder = (color: string) => `${buttonBorderWidth} solid ${color}`;

/** Button corner radius: the `buttonRadius` token, else `fallback`. */
export const buttonRadius = (fallback: string) => `var(--nozle-button-radius, ${fallback})`;

export const buttonShadow = "var(--nozle-button-shadow, none)";

export interface ResolvedAppearance {
  variables: Variables;
  planCardLayout?: "card" | "panel";
  elements: Partial<Record<ElementKey, { className?: string; style?: CSSProperties }>>;
}

function addTheme(target: ResolvedAppearance, theme: Theme | undefined) {
  if (!theme) return;
  Object.assign(target.variables, theme.variables);
  if (theme.planCardLayout) target.planCardLayout = theme.planCardLayout;
  for (const [key, value] of Object.entries(theme.elements ?? {}) as [ElementKey, string | CSSProperties][]) {
    const current = target.elements[key] ?? {};
    target.elements[key] =
      typeof value === "string"
        ? { ...current, className: [current.className, value].filter(Boolean).join(" ") }
        : { ...current, style: { ...current.style, ...value } };
  }
}

/**
 * Merges appearances in order, each later one winning: for each, its theme (or themes, in order) then
 * its own variables and elements. Pass the provider's appearance first, then the component's.
 */
export function mergeAppearance(...layers: (Appearance | undefined)[]): ResolvedAppearance {
  const resolved: ResolvedAppearance = { variables: {}, elements: {} };
  for (const layer of layers) {
    if (!layer) continue;
    const themes = Array.isArray(layer.theme) ? layer.theme : [layer.theme];
    themes.forEach((theme) => addTheme(resolved, theme));
    addTheme(resolved, layer);
  }
  return resolved;
}

/** Inline CSS custom properties for a set of variables; `colorScheme` becomes `color-scheme`. */
export function toCssVars(variables: Variables): CSSProperties {
  const style: Record<string, string> = {};
  for (const [key, value] of Object.entries(variables)) {
    if (value == null || value === "") continue;
    if (key === "colorScheme") style.colorScheme = value;
    else style[CSS_VAR[key as ColorKey]] = value;
  }
  return style as CSSProperties;
}

/** The card frame shared by the data components. */
export const surface: CSSProperties = {
  background: T.card,
  color: T.foreground,
  border: border(),
  borderRadius: T.radius,
  boxShadow: T.shadow,
  padding: "1.25rem",
  fontFamily: T.font,
};

/** Tables, after the Nozle dashboard table: a bordered frame, a tinted header band with small
 * uppercase labels, roomy rows, and numbers right-aligned in tabular figures. */
export const table = {
  frame: {
    background: T.card,
    color: T.foreground,
    fontFamily: T.font,
    border: border(),
    borderRadius: T.radius,
    overflowX: "auto",
    minWidth: 0,
    maxWidth: "100%",
  } as CSSProperties,
  table: { width: "100%", borderCollapse: "collapse", fontSize: "14px" } as CSSProperties,
  head: (numeric = false): CSSProperties => ({
    height: "44px",
    padding: "0 20px",
    textAlign: numeric ? "right" : "left",
    verticalAlign: "middle",
    font: T.labelFont,
    letterSpacing: T.labelSpacing,
    textTransform: T.labelTransform as CSSProperties["textTransform"],
    whiteSpace: "nowrap",
    color: T.mutedForeground,
    background: T.tableHeader,
    borderBottom: border(),
  }),
  /** `last`: the final body row, whose line the frame already draws. */
  cell: (numeric = false, last = false): CSSProperties => ({
    height: "48px",
    padding: "14px 20px",
    verticalAlign: "middle",
    whiteSpace: "nowrap",
    textAlign: numeric ? "right" : "left",
    borderBottom: last ? "none" : border(T.rowLine),
    ...(numeric && { fontFamily: T.fontNumbers, fontVariantNumeric: "tabular-nums" }),
  }),
  foot: (numeric = false): CSSProperties => ({
    ...table.cell(numeric, true),
    borderTop: border(),
    background: T.tableHeader,
    fontWeight: 600,
  }),
};

export type ButtonVariant = "primary" | "secondary" | "outline";

/** Button look shared by every component, from the theme tokens. */
export function buttonStyle(variant: ButtonVariant = "primary", busy = false): CSSProperties {
  const colors: Record<ButtonVariant, CSSProperties> = {
    primary: { background: T.primary, color: T.primaryForeground, border: primaryButtonBorder(T.primary), boxShadow: buttonShadow },
    secondary: { background: T.secondary, color: T.foreground, border: buttonBorder(T.input) },
    outline: { background: "transparent", color: T.primary, border: buttonBorder(T.primary) },
  };
  return {
    ...colors[variant],
    padding: "0.75rem 1.5rem",
    borderRadius: buttonRadius(`calc(${T.radius} * 0.75)`),
    fontFamily: T.font,
    fontSize: "0.9375rem",
    fontWeight: 600,
    lineHeight: 1.4,
    cursor: busy ? "wait" : "pointer",
    opacity: busy ? 0.7 : 1,
    transition: "filter 0.15s ease",
  };
}
