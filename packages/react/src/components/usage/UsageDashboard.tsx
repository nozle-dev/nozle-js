"use client";

/**
 * UsageDashboard — renders multiple UsageMeters for all features.
 *
 * Accepts features as props, or build them from the catalog and your usage results with
 * `usageItems`. Shows a skeleton while loading, an alert on error and a message when empty.
 */

import { UsageMeter } from "./UsageMeter.js";
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
}

export function UsageDashboard({
  features = [],
  loading = false,
  error = null,
  emptyMessage = "No usage to show yet.",
}: UsageDashboardProps) {
  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-8 rounded"
            style={{ background: "var(--nozle-border, var(--border))" }}
          />
        ))}
      </div>
    );
  }

  if (error) {
    return <p role="alert">{typeof error === "string" ? error : error.message}</p>;
  }

  if (features.length === 0) return <p role="status">{emptyMessage}</p>;

  return (
    <div className="space-y-4">
      {features.map((f) => (
        <UsageMeter key={f.key} used={f.used} limit={f.limit} label={f.label} />
      ))}
    </div>
  );
}
