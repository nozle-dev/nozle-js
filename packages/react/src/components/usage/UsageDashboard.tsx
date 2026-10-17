"use client";

/**
 * UsageDashboard — renders multiple UsageMeters for all features.
 *
 * Accepts features as props, or build them from the catalog and your usage results with
 * `usageItems`. Shows a skeleton while loading, an alert on error and a message when empty.
 */

import { UsageMeter } from "./UsageMeter.js";
import { useAppearance } from "../../appearance/context.js";
import { T, surface, text, type Appearance } from "../../appearance/tokens.js";
import type { CatalogEntitlement } from "../pricing/plan-features.js";

export interface UsageDashboardFeature {
  key: string;
  label: string;
  used: number;
  /** `null` or `undefined` means the feature has no limit. */
  limit?: number | null;
}

/** The `can()` result fields the dashboard needs. */
export interface UsageResult {
  used: number;
  limit?: number | null;
}

/**
 * Joins a plan's metered entitlements (names come from the catalog) with the usage results you read
 * on your backend, keyed by feature code. Entitlements without a result are left out.
 */
export function usageItems(
  entitlements: CatalogEntitlement[],
  results: Record<string, UsageResult | undefined>,
): UsageDashboardFeature[] {
  return entitlements.flatMap((entitlement) => {
    const result = results[entitlement.code];
    if (entitlement.feature_type !== "metered" || !result) return [];
    return [{ key: entitlement.code, label: entitlement.name, used: result.used, limit: result.limit ?? null }];
  });
}

export interface UsageDashboardProps {
  features?: UsageDashboardFeature[];
  loading?: boolean;
  /** Shown in place of the meters when set. */
  error?: Error | string | null;
  /** Shown when there are no features. */
  emptyMessage?: string;
  appearance?: Appearance;
}

export function UsageDashboard({
  features = [],
  loading = false,
  error = null,
  emptyMessage = "No usage to show yet.",
  appearance,
}: UsageDashboardProps) {
  const { root } = useAppearance(appearance);
  const props = root("usageDashboard", {
    ...surface,
    margin: 0,
    display: "flex",
    flexDirection: "column",
    gap: loading ? "0.75rem" : "1rem",
    // Errors and the empty message take the same colours as in the other components.
    ...(error ? { color: T.dangerText } : features.length === 0 && !loading && text.secondary),
  });

  if (loading) {
    return (
      <div {...props} aria-busy="true">
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ height: "2rem", borderRadius: `calc(${T.radius} / 3)`, background: T.skeleton }} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p {...props} role="alert">
        {typeof error === "string" ? error : error.message}
      </p>
    );
  }

  if (features.length === 0) {
    return (
      <p {...props} role="status">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div {...props}>
      {features.map((f) => (
        <UsageMeter key={f.key} used={f.used} limit={f.limit} label={f.label} appearance={appearance} />
      ))}
    </div>
  );
}
