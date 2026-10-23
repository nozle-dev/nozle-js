// Public catalog types and pure helpers for the pricing table.
//
// `GET /api/v1/plans` returns `plans` and, on current APIs, `families`. A
// family groups the billing intervals of one offer and carries the pricing
// table settings; the pricing table shows one card per family. Older APIs
// return no `families` key: each plan is then its own card.

import { formatMinorAmount } from "../billing/amounts.js";
import {
  intervalLabel,
  planFeatures as catalogPlanFeatures,
  sortPlansByPrice,
  type CatalogCharge,
  type CatalogCreditGrantRule,
  type CatalogEntitlement,
  type CatalogPrivilege,
} from "./plan-features.js";

export type PricingInterval =
  | "weekly"
  | "monthly"
  | "quarterly"
  | "semiannual"
  | "yearly";

export type PricingPrivilege = CatalogPrivilege;

export type PricingEntitlement = CatalogEntitlement;

export interface PricingPlan {
  code: string;
  name: string;
  amount_cents: number;
  amount_currency: string;
  // Older APIs may return other interval strings.
  interval: PricingInterval | (string & {});
  description?: string | null;
  pending_deletion?: boolean;
  plan_family_code?: string | null;
  /** The version of the code this plan is (plan versioning). The catalog lists current versions only. */
  version?: number;
  /** False for an older version, which is never shown on the pricing table. */
  is_current?: boolean;
  /** Present in the public catalog. Absent from an older or reduced response. */
  entitlements?: PricingEntitlement[];
  credit_grant_rules?: CatalogCreditGrantRule[];
  charges?: CatalogCharge[];
}

/** Display settings of one feature on a family's pricing card. */
export interface PricingFamilyFeature {
  code: string;
  name?: string | null;
  description?: string | null;
  show_on_pricing?: boolean;
  show_description?: boolean;
  display_position?: number | null;
}

export interface PricingFamily {
  code: string;
  name: string;
  description?: string | null;
  show_on_pricing?: boolean;
  pricing_position?: number | null;
  pricing_highlighted?: boolean;
  badge_text?: string | null;
  cta_text?: string | null;
  /** Codes of the family's plans, ordered weekly to yearly. */
  plan_codes: string[];
  features?: PricingFamilyFeature[];
}

/** The `GET /api/v1/plans` payload. `families` is absent on older APIs. */
export interface PricingCatalog {
  plans: PricingPlan[];
  families?: PricingFamily[] | null;
}

export interface PricingFeature {
  label: string;
  description?: string | null;
}

/**
 * Feature overrides: a record keyed by family code or plan code, or an array
 * aligned to the cards in display order.
 */
export type PricingFeatureOverrides =
  | Record<string, Array<string | PricingFeature>>
  | Array<Array<string | PricingFeature> | undefined>;

export interface PricingIntervalOption {
  interval: PricingInterval;
  label: string;
  /** Best whole-percent saving of any visible family against its monthly plan. */
  savingsPercent: number | null;
}

export interface PricingCard {
  /** Family code, or the plan code when the catalog has no families. */
  key: string;
  /** Null when the catalog has no families (older APIs). */
  family: PricingFamily | null;
  /** The family's live plans, ordered weekly to yearly. */
  plans: PricingPlan[];
  /** The plan shown, checked out and passed to `onSelect`. */
  plan: PricingPlan;
  /** True when the family has no plan for the requested interval. */
  isFallbackInterval: boolean;
  name: string;
  description: string | null;
  /**
   * Family cards: the per-month equivalent of the plan's price, for example
   * "$40.83". Without families: the plan's price, for example "$14.99".
   */
  price: string;
  /** "/mo" on family cards; the plan's own interval ("/quarter") without families. */
  pricePeriod: string;
  /**
   * Family cards: for example "Billed $490 yearly · save 17%" or "Billed
   * monthly". Empty without families.
   */
  billing: string;
  /** Whole-percent saving against the family's monthly plan, when positive. */
  savingsPercent: number | null;
  features: PricingFeature[];
  highlighted: boolean;
  /** Badge text when highlighted, otherwise null. */
  badge: string | null;
  /** Call-to-action text (family `cta_text` or "Get {name}"). */
  cta: string;
  /** The family code or one of its plan codes is listed in `contactSales`. */
  enterprise: boolean;
}

export interface GetPricingCardsOptions {
  /**
   * Interval to show ("annual" is accepted for "yearly"). Defaults to
   * monthly when offered, else the first available interval. Without
   * families, plans of other intervals are left out only when an interval
   * is given.
   */
  interval?: PricingInterval | "annual" | null;
  locale?: string;
  /** Family code or plan code to highlight instead of `pricing_highlighted`. */
  highlight?: string | null;
  /**
   * Badge on the highlighted card, replacing the family's `badge_text`
   * (default "Most Popular"). `null` shows no badge.
   */
  badge?: string | null;
  features?: PricingFeatureOverrides;
  /**
   * Codes of families or plans sold on request. Their card's `enterprise` is
   * true. Without families they also stay visible whatever the interval and
   * come last.
   */
  contactSales?: readonly string[];
  /**
   * Orders the plans of a catalog without families. By default they are
   * sorted by base price, cheapest first, with `contactSales` plans last.
   * Families are ordered by `pricing_position`.
   */
  sort?: (a: PricingPlan, b: PricingPlan) => number;
}

// ─── Intervals ───────────────────────────────────────────────────────────────

export const PRICING_INTERVALS: readonly PricingInterval[] = [
  "weekly",
  "monthly",
  "quarterly",
  "semiannual",
  "yearly",
];

const INTERVAL_LABELS: Record<PricingInterval, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  semiannual: "Every 6 months",
  yearly: "Annual",
};

const BILLED_WORDS: Record<PricingInterval, string> = {
  weekly: "weekly",
  monthly: "monthly",
  quarterly: "quarterly",
  semiannual: "every 6 months",
  yearly: "yearly",
};

// Billing periods per year, and the months-per-period ratio as a fraction
// (numerator / denominator) for the exact per-month equivalent.
const PERIODS_PER_YEAR: Record<PricingInterval, bigint> = {
  weekly: 52n,
  monthly: 12n,
  quarterly: 4n,
  semiannual: 2n,
  yearly: 1n,
};

function isPricingInterval(value: unknown): value is PricingInterval {
  return (
    typeof value === "string" &&
    (PRICING_INTERVALS as readonly string[]).includes(value)
  );
}

function intervalRank(interval: string): number {
  return (PRICING_INTERVALS as readonly string[]).indexOf(interval);
}

/** Normalizes an interval name, accepting "annual" for "yearly". */
export function normalizePricingInterval(
  value: string | null | undefined,
): PricingInterval | null {
  if (value === "annual") return "yearly";
  return isPricingInterval(value) ? value : null;
}

export function getPricingIntervalLabel(interval: PricingInterval): string {
  return INTERVAL_LABELS[interval];
}

// ─── Ordering ────────────────────────────────────────────────────────────────

function hasPosition(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Compare two optional positions: positioned items first, ascending; nulls last. */
function comparePositions(
  a: number | null | undefined,
  b: number | null | undefined,
): number {
  const aSet = hasPosition(a);
  const bSet = hasPosition(b);
  if (aSet && bSet) return a - b;
  if (aSet) return -1;
  if (bSet) return 1;
  return 0;
}

// ─── Locale ──────────────────────────────────────────────────────────────────

const DEFAULT_LOCALE = "en-US";

/**
 * Returns `locale` when it is a well-formed BCP 47 tag, otherwise `en-US`.
 * Intl constructors and `localeCompare` throw a RangeError on malformed tags
 * such as "en_US"; this keeps a bad `locale` prop from crashing a render.
 */
export function resolvePricingLocale(locale: string | null | undefined): string {
  if (typeof locale !== "string" || locale.trim() === "") return DEFAULT_LOCALE;
  try {
    Intl.getCanonicalLocales(locale);
    return locale;
  } catch {
    return DEFAULT_LOCALE;
  }
}

// ─── Groups ──────────────────────────────────────────────────────────────────

interface PricingGroup {
  key: string;
  family: PricingFamily | null;
  plans: PricingPlan[];
}

// NOTE: An older version (is_current false) is the pricing of its existing subscribers, never one to sell, even
//       when a `plans` prop mixes versions in.
function isLive(plan: PricingPlan): boolean {
  return plan.pending_deletion !== true && plan.is_current !== false;
}

function hasFamilies(
  catalog: PricingCatalog,
): catalog is PricingCatalog & { families: PricingFamily[] } {
  return Array.isArray(catalog.families);
}

/**
 * Visible groups in display order. With families: one per family with
 * `show_on_pricing !== false` and at least one live plan, ordered by
 * `pricing_position` (nulls last) then API order. Without families: one per
 * live plan, in API order.
 */
function getPricingGroups(catalog: PricingCatalog): PricingGroup[] {
  const plans = catalog.plans ?? [];
  if (!hasFamilies(catalog)) {
    return plans
      .filter(isLive)
      .map((plan) => ({ key: plan.code, family: null, plans: [plan] }));
  }
  const byCode = new Map<string, PricingPlan>();
  for (const plan of plans) {
    if (isLive(plan) && !byCode.has(plan.code)) byCode.set(plan.code, plan);
  }
  return catalog.families
    .map((family, index) => ({ family, index }))
    .filter(({ family }) => family.show_on_pricing !== false)
    .sort(
      (a, b) =>
        comparePositions(a.family.pricing_position, b.family.pricing_position) ||
        a.index - b.index,
    )
    .map(({ family }) => {
      const seen = new Set<string>();
      const familyPlans: PricingPlan[] = [];
      for (const code of family.plan_codes ?? []) {
        const plan = byCode.get(code);
        if (plan && !seen.has(code)) {
          seen.add(code);
          familyPlans.push(plan);
        }
      }
      return { key: family.code, family, plans: familyPlans };
    })
    .filter((group) => group.plans.length > 0);
}

// ─── Money ───────────────────────────────────────────────────────────────────

function toMinor(value: number | string): bigint | null {
  const raw = String(value);
  if (!/^-?\d+$/.test(raw)) return null;
  if (typeof value === "number" && !Number.isSafeInteger(value)) return null;
  return BigInt(raw);
}

/** Round-half-up of numerator / denominator for non-negative integers. */
function divideRounded(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n) return -divideRounded(-numerator, denominator);
  return (2n * numerator + denominator) / (2n * denominator);
}

function perMonthMinor(amount: bigint, interval: PricingInterval): bigint {
  return divideRounded(amount * PERIODS_PER_YEAR[interval], 12n);
}

function fmt(amount: bigint | number, currency: string, locale: string): string {
  return formatMinorAmount(String(amount), currency, locale, {
    trimZeroFraction: true,
  });
}

/**
 * Whole-percent saving of `plan` over a year against `monthly`, or null when
 * not positive, not comparable or not computable.
 */
function savingsAgainstMonthly(
  plan: PricingPlan,
  monthly: PricingPlan | undefined,
): number | null {
  if (!monthly || monthly === plan) return null;
  if (!isPricingInterval(plan.interval) || plan.interval === "monthly") return null;
  if (monthly.amount_currency !== plan.amount_currency) return null;
  const monthlyAmount = toMinor(monthly.amount_cents);
  const amount = toMinor(plan.amount_cents);
  if (monthlyAmount === null || amount === null) return null;
  const base = monthlyAmount * 12n;
  const cost = amount * PERIODS_PER_YEAR[plan.interval];
  if (base <= 0n || cost >= base) return null;
  const percent = Number(divideRounded(100n * (base - cost), base));
  return percent > 0 ? percent : null;
}

function monthlyPlanOf(group: PricingGroup): PricingPlan | undefined {
  return group.family
    ? group.plans.find((plan) => plan.interval === "monthly")
    : undefined;
}

// ─── Intervals available ─────────────────────────────────────────────────────

/** Intervals offered by the visible cards, ordered weekly to yearly. */
export function getAvailableIntervals(catalog: PricingCatalog): PricingInterval[] {
  const present = new Set<string>();
  for (const group of getPricingGroups(catalog)) {
    for (const plan of group.plans) present.add(plan.interval);
  }
  return PRICING_INTERVALS.filter((interval) => present.has(interval));
}

/**
 * Options for an interval switch: each available interval with its label
 * and the best family saving against the family's monthly plan.
 */
export function getPricingIntervalOptions(
  catalog: PricingCatalog,
): PricingIntervalOption[] {
  const groups = getPricingGroups(catalog);
  return getAvailableIntervals(catalog).map((interval) => {
    let best: number | null = null;
    if (interval !== "monthly") {
      for (const group of groups) {
        const plan = group.plans.find((p) => p.interval === interval);
        const saving = plan ? savingsAgainstMonthly(plan, monthlyPlanOf(group)) : null;
        if (saving !== null && (best === null || saving > best)) best = saving;
      }
    }
    return { interval, label: INTERVAL_LABELS[interval], savingsPercent: best };
  });
}

/**
 * The interval to show first: `preferred` ("annual" means "yearly") when it
 * is available, otherwise monthly when available, otherwise the first one.
 */
export function getDefaultInterval(
  catalog: PricingCatalog,
  preferred?: string | null,
): PricingInterval | null {
  const available = getAvailableIntervals(catalog);
  const wanted = normalizePricingInterval(preferred);
  if (wanted && available.includes(wanted)) return wanted;
  if (available.includes("monthly")) return "monthly";
  return available[0] ?? null;
}

/** The family's plan for `interval`, else the plan of the nearest interval (shorter on a tie). */
function pickPlan(plans: PricingPlan[], interval: PricingInterval | null): PricingPlan {
  if (interval === null) return plans[0];
  const exact = plans.find((plan) => plan.interval === interval);
  if (exact) return exact;
  const target = intervalRank(interval);
  let best = plans[0];
  let bestScore = Number.POSITIVE_INFINITY;
  for (const plan of plans) {
    const rank = intervalRank(plan.interval);
    if (rank < 0) continue;
    // Distance first; on a tie the shorter interval wins.
    const score = Math.abs(rank - target) * 2 + (rank > target ? 1 : 0);
    if (score < bestScore) {
      best = plan;
      bestScore = score;
    }
  }
  return best;
}

// ─── Features ────────────────────────────────────────────────────────────────

function isTrueBoolean(privilege: PricingPrivilege): boolean {
  const { value } = privilege;
  if (value === true) return true;
  return (
    privilege.value_type === "boolean" &&
    typeof value === "string" &&
    value.toLowerCase() === "true"
  );
}

function formatPrivilegeValue(
  privilege: PricingPrivilege,
  numberFormat: Intl.NumberFormat,
): string | null {
  const { value } = privilege;
  if (value === null || value === undefined) return null;
  if (isTrueBoolean(privilege)) return null;
  if (value === false) return "No";
  if (typeof value === "number") {
    return Number.isFinite(value) ? numberFormat.format(value) : null;
  }
  const text = String(value).trim();
  if (text === "") return null;
  if (privilege.value_type === "boolean" && text.toLowerCase() === "false") {
    return "No";
  }
  if (privilege.value_type === "integer" && /^-?\d+$/.test(text)) {
    const parsed = Number(text);
    if (Number.isSafeInteger(parsed)) return numberFormat.format(parsed);
  }
  return text;
}

/** "Projects: 20", "Storage (GB: 10, Tier: fast)", "API calls: 100,000" or just the name. */
function featureLabel(
  name: string,
  entitlement: PricingEntitlement | undefined,
  numberFormat: Intl.NumberFormat,
): string {
  const values = (entitlement?.privileges ?? [])
    .map((privilege) => ({
      privilege,
      text: formatPrivilegeValue(privilege, numberFormat),
    }))
    .filter(
      (entry): entry is { privilege: PricingPrivilege; text: string } =>
        entry.text !== null,
    );
  if (values.length === 1) return `${name}: ${values[0].text}`;
  if (values.length > 1) {
    const parts = values.map(({ privilege, text }) => {
      const privilegeName = privilege.name?.trim() || privilege.code;
      return `${privilegeName}: ${text}`;
    });
    return `${name} (${parts.join(", ")})`;
  }
  const limit = entitlement?.usage_limit;
  if (typeof limit === "number" && Number.isFinite(limit)) {
    return `${name}: ${numberFormat.format(limit)}`;
  }
  return name;
}

function trimmed(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Features of a family card, with values from the selected plan. */
function familyFeatures(
  family: PricingFamily,
  plan: PricingPlan,
  locale: string,
): PricingFeature[] {
  const numberFormat = new Intl.NumberFormat(locale);
  const entitlements = new Map<string, PricingEntitlement>();
  for (const entitlement of plan.entitlements ?? []) {
    if (!entitlements.has(entitlement.code)) {
      entitlements.set(entitlement.code, entitlement);
    }
  }
  return (family.features ?? [])
    .filter((feature) => feature.show_on_pricing !== false)
    .map((feature, index) => {
      const entitlement = entitlements.get(feature.code);
      const name =
        trimmed(feature.name) || trimmed(entitlement?.name) || feature.code;
      return { feature, entitlement, index, name };
    })
    .sort(
      (a, b) =>
        comparePositions(a.feature.display_position, b.feature.display_position) ||
        a.name.localeCompare(b.name, locale) ||
        a.index - b.index,
    )
    .map(({ feature, entitlement, name }) => {
      const label = featureLabel(name, entitlement, numberFormat);
      const description = trimmed(feature.description);
      return feature.show_description === true && description
        ? { label, description }
        : { label };
    });
}

/**
 * Features of a plan card on an older API: what the plan gives (entitlements,
 * credit grants and usage prices), as `planFeatures` lists it.
 */
function planCardFeatures(plan: PricingPlan): PricingFeature[] {
  return catalogPlanFeatures(plan).map((label) => ({ label }));
}

function normalizeFeatures(items: Array<string | PricingFeature>): PricingFeature[] {
  return items
    .map((item) => (typeof item === "string" ? { label: item } : item))
    .filter(
      (item): item is PricingFeature =>
        Boolean(item) && typeof item.label === "string",
    );
}

function overrideFeatures(
  overrides: PricingFeatureOverrides | undefined,
  group: PricingGroup,
  plan: PricingPlan,
  cardIndex: number,
): PricingFeature[] | null {
  if (!overrides) return null;
  if (Array.isArray(overrides)) {
    const entry = overrides[cardIndex];
    return entry ? normalizeFeatures(entry) : null;
  }
  const keys = [group.key, plan.code, ...group.plans.map((p) => p.code)];
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      return normalizeFeatures(overrides[key] ?? []);
    }
  }
  return null;
}

// ─── Cards ───────────────────────────────────────────────────────────────────

/**
 * A plan's cost over a year in minor units, or null when its interval or
 * amount is not known. Compares plans of different intervals.
 */
export function yearlyMinor(plan: PricingPlan): bigint | null {
  const amount = toMinor(plan.amount_cents);
  if (amount === null || !isPricingInterval(plan.interval)) return null;
  return amount * PERIODS_PER_YEAR[plan.interval];
}

/** A card without families shows the plan's price per its own interval, as before families. */
function planPriceStrings(
  plan: PricingPlan,
  locale: string,
): { price: string; pricePeriod: string; billing: string; savingsPercent: null } {
  const amount = toMinor(plan.amount_cents);
  return {
    price: fmt(amount ?? plan.amount_cents, plan.amount_currency, locale),
    pricePeriod: plan.interval ? `/${intervalLabel(plan.interval)}` : "",
    billing: "",
    savingsPercent: null,
  };
}

function priceStrings(
  plan: PricingPlan,
  monthly: PricingPlan | undefined,
  locale: string,
): { price: string; pricePeriod: string; billing: string; savingsPercent: number | null } {
  const amount = toMinor(plan.amount_cents);
  const currency = plan.amount_currency;
  if (!isPricingInterval(plan.interval) || amount === null) {
    return {
      price: fmt(amount ?? plan.amount_cents, currency, locale),
      pricePeriod: "",
      billing: plan.interval ? `Billed ${plan.interval}` : "",
      savingsPercent: null,
    };
  }
  const price = fmt(perMonthMinor(amount, plan.interval), currency, locale);
  if (plan.interval === "monthly") {
    return { price, pricePeriod: "/mo", billing: "Billed monthly", savingsPercent: null };
  }
  const savingsPercent = savingsAgainstMonthly(plan, monthly);
  const billed = `Billed ${fmt(amount, currency, locale)} ${BILLED_WORDS[plan.interval]}`;
  return {
    price,
    pricePeriod: "/mo",
    billing: savingsPercent === null ? billed : `${billed} · save ${savingsPercent}%`,
    savingsPercent,
  };
}

/**
 * Pricing cards in display order for one interval: the selected plan of each
 * visible family (or the nearest interval's plan when the family has none for
 * it), its per-month price and billing line, its features, the highlight,
 * badge and call to action. Without families each live plan is a card.
 */
export function getPricingCards(
  catalog: PricingCatalog,
  options: GetPricingCardsOptions = {},
): PricingCard[] {
  const locale = resolvePricingLocale(options.locale);
  const families = hasFamilies(catalog);
  const requested = normalizePricingInterval(options.interval ?? null);
  const interval = requested ?? getDefaultInterval(catalog);
  const contactSales = new Set(options.contactSales ?? []);
  const isContactSales = (group: PricingGroup) =>
    contactSales.has(group.key) || group.plans.some((plan) => contactSales.has(plan.code));
  let groups = getPricingGroups(catalog);
  if (!families) {
    if (options.sort) {
      const sort = options.sort;
      groups = groups
        .map((group, index) => ({ group, index }))
        .sort((a, b) => sort(a.group.plans[0], b.group.plans[0]) || a.index - b.index)
        .map(({ group }) => group);
    } else {
      const sales = groups.filter(isContactSales);
      const byPlan = new Map(groups.map((group) => [group.plans[0], group]));
      groups = [
        ...sortPlansByPrice(groups.filter((group) => !isContactSales(group)).map((group) => group.plans[0]))
          .map((plan) => byPlan.get(plan) as PricingGroup),
        ...sales,
      ];
    }
    if (requested) {
      groups = groups.filter(
        (group) => group.plans[0].interval === requested || isContactSales(group),
      );
    }
  }

  const highlight = options.highlight ?? null;
  const highlightedKey =
    highlight !== null
      ? groups.find(
          (group) =>
            group.key === highlight ||
            group.plans.some((plan) => plan.code === highlight),
        )?.key
      : groups.find((group) => group.family?.pricing_highlighted === true)?.key;

  const badge = (family: PricingFamily | null) =>
    options.badge !== undefined
      ? options.badge === null ? null : trimmed(options.badge) || null
      : trimmed(family?.badge_text) || "Most Popular";

  return groups.map((group, cardIndex) => {
    const plan = pickPlan(group.plans, interval);
    const family = group.family;
    const name = trimmed(family?.name) || plan.name;
    const description = trimmed(family?.description) || trimmed(plan.description) || null;
    const highlighted = highlightedKey !== undefined && highlightedKey === group.key;
    const features =
      overrideFeatures(options.features, group, plan, cardIndex) ??
      (family ? familyFeatures(family, plan, locale) : planCardFeatures(plan));
    return {
      key: group.key,
      family,
      plans: group.plans,
      plan,
      isFallbackInterval: families && interval !== null && plan.interval !== interval,
      name,
      description,
      ...(family ? priceStrings(plan, monthlyPlanOf(group), locale) : planPriceStrings(plan, locale)),
      features,
      highlighted,
      badge: highlighted ? badge(family) : null,
      cta: trimmed(family?.cta_text) || `Get ${name}`,
      enterprise: isContactSales(group),
    };
  });
}
