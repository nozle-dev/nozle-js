export interface CatalogPrivilege {
  code: string;
  name: string;
  value_type: string;
  value: string | number | boolean | null;
}

export interface CatalogEntitlement {
  feature_type: string;
  code: string;
  name: string;
  description?: string | null;
  usage_limit?: number | null;
  privileges?: CatalogPrivilege[];
}

export interface CatalogCreditGrantRule {
  credit_system_code: string;
  amount: string;
  interval: string;
  interval_count?: number;
}

export interface CatalogChargeRange {
  from_value: number;
  to_value: number | null;
  per_unit_amount?: string;
  flat_amount?: string;
  rate?: string;
}

/** A usage charge. Amounts inside `properties` are decimal strings in currency units, not cents. */
export interface CatalogCharge {
  code?: string | null;
  feature_code?: string | null;
  charge_model: string;
  properties?: {
    amount?: string;
    package_size?: number;
    free_units?: number;
    rate?: string;
    fixed_amount?: string;
    graduated_ranges?: CatalogChargeRange[];
    volume_ranges?: CatalogChargeRange[];
    graduated_percentage_ranges?: CatalogChargeRange[];
  };
}

export interface PlanFeatureSource {
  amount_currency: string;
  entitlements?: CatalogEntitlement[];
  credit_grant_rules?: CatalogCreditGrantRule[];
  charges?: CatalogCharge[];
}

function number(value: number | string): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString("en-US", { maximumFractionDigits: 6 }) : String(value);
}

function money(amount: string, currency: string): string {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed)) return `${amount} ${currency}`;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 6 }).format(parsed);
  } catch {
    return `${currency} ${number(amount)}`;
  }
}

function words(code: string): string {
  return code.replace(/_/g, " ");
}

function entitlementRows(entitlement: CatalogEntitlement): string[] {
  if (entitlement.feature_type === "config") {
    return (entitlement.privileges ?? []).flatMap((privilege) => {
      if (privilege.value === null || privilege.value === false) return [];
      if (privilege.value === true) return [`${entitlement.name}: ${privilege.name}`];
      return [`${entitlement.name}: ${privilege.value}`];
    });
  }
  if (entitlement.feature_type === "metered" && entitlement.usage_limit != null) {
    return [`${number(entitlement.usage_limit)} ${entitlement.name}`];
  }
  return [entitlement.name];
}

function creditGrantRow(rule: CatalogCreditGrantRule): string {
  const credits = `${number(rule.amount)} ${words(rule.credit_system_code)}`;
  if (rule.interval === "lifetime") return `${credits} (one time)`;
  const count = rule.interval_count ?? 1;
  return count === 1 ? `${credits} every ${rule.interval}` : `${credits} every ${count} ${rule.interval}s`;
}

function isZero(amount?: string): boolean {
  return amount === undefined || Number(amount) === 0;
}

function rangeLabel(range: CatalogChargeRange, unit: string): string {
  const from = number(range.from_value);
  return range.to_value === null ? `${from}+ ${unit}` : `${from} to ${number(range.to_value)} ${unit}`;
}

function rangeRows(ranges: CatalogChargeRange[], unit: string, currency: string): string[] {
  return ranges.map((range) => {
    const parts: string[] = [];
    if (!isZero(range.flat_amount)) parts.push(`${money(range.flat_amount as string, currency)} flat`);
    if (!isZero(range.per_unit_amount)) parts.push(`${money(range.per_unit_amount as string, currency)} each`);
    if (!isZero(range.rate)) parts.push(`${number(range.rate as string)}%`);
    return `${rangeLabel(range, unit)}: ${parts.length ? parts.join(" + ") : "free"}`;
  });
}

function chargeRows(charge: CatalogCharge, currency: string): string[] {
  const properties = charge.properties ?? {};
  const unit = charge.feature_code ? words(charge.feature_code) : "unit";
  switch (charge.charge_model) {
    case "standard":
      return properties.amount === undefined ? [] : [`${money(properties.amount, currency)} per ${unit}`];
    case "package": {
      if (properties.amount === undefined || !properties.package_size) return [];
      const free = properties.free_units ? `, first ${number(properties.free_units)} free` : "";
      return [`${money(properties.amount, currency)} per ${number(properties.package_size)} ${unit}${free}`];
    }
    case "graduated":
      return rangeRows(properties.graduated_ranges ?? [], unit, currency);
    case "volume":
      return rangeRows(properties.volume_ranges ?? [], unit, currency);
    case "graduated_percentage":
      return rangeRows(properties.graduated_percentage_ranges ?? [], unit, currency);
    case "percentage": {
      if (properties.rate === undefined) return [];
      const fixed = isZero(properties.fixed_amount) ? "" : ` + ${money(properties.fixed_amount as string, currency)} per ${unit}`;
      return [`${number(properties.rate)}% of each ${unit}${fixed}`];
    }
    default:
      return [];
  }
}

/**
 * One line per thing a plan gives, built only from the catalog: entitlements, credit grants and usage
 * prices, in the order the catalog returns them. Charges whose price cannot be written as a line
 * (`custom`, `dynamic`) are skipped.
 */
export function planFeatures(plan: PlanFeatureSource): string[] {
  const rows = (plan.entitlements ?? []).flatMap(entitlementRows);
  rows.push(...(plan.credit_grant_rules ?? []).map(creditGrantRow));
  for (const charge of plan.charges ?? []) rows.push(...chargeRows(charge, plan.amount_currency));
  return rows;
}

const INTERVAL_LABELS: Record<string, string> = {
  weekly: "week",
  monthly: "month",
  quarterly: "quarter",
  semiannual: "6 months",
  yearly: "year",
};

/** The unit a plan's base price is billed per, for example `month`. Unknown intervals are shown as sent. */
export function intervalLabel(interval: string): string {
  return INTERVAL_LABELS[interval] ?? interval;
}

/** A plan's base price in its own currency, for example `$14.99` or `₹999`. */
export function formatPlanPrice(amountCents: number, currency: string): string {
  const amount = amountCents / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

export interface ComparisonPlan extends PlanFeatureSource {
  code: string;
}

export interface ComparisonRow {
  key: string;
  label: string;
  values: Record<string, string | boolean>;
}

function entitlementValue(entitlement: CatalogEntitlement): string | boolean {
  if (entitlement.feature_type === "config") {
    const values = (entitlement.privileges ?? [])
      .filter((privilege) => privilege.value !== null && privilege.value !== false)
      .map((privilege) => (privilege.value === true ? privilege.name : String(privilege.value)));
    return values.length ? values.join(", ") : false;
  }
  if (entitlement.feature_type === "metered" && entitlement.usage_limit != null) {
    return number(entitlement.usage_limit);
  }
  return true;
}

/**
 * One row per entitlement and per granted credit system across the plans, in the order they first
 * appear. A plan that does not have the entitlement gets `false`, so the table shows the real gap.
 */
export function comparisonRows(plans: ComparisonPlan[]): ComparisonRow[] {
  const rows = new Map<string, ComparisonRow>();
  const row = (key: string, label: string): ComparisonRow => {
    let existing = rows.get(key);
    if (!existing) {
      existing = { key, label, values: {} };
      rows.set(key, existing);
    }
    return existing;
  };
  for (const plan of plans) {
    for (const entitlement of plan.entitlements ?? []) {
      row(`entitlement:${entitlement.code}`, entitlement.name).values[plan.code] = entitlementValue(entitlement);
    }
    for (const rule of plan.credit_grant_rules ?? []) {
      row(`credit:${rule.credit_system_code}`, words(rule.credit_system_code)).values[plan.code] = creditGrantRow(rule);
    }
  }
  const all = [...rows.values()];
  for (const item of all) {
    for (const plan of plans) item.values[plan.code] ??= false;
  }
  return all;
}
