"use client";

/**
 * UsageDashboard — renders multiple UsageMeters for all features.
 *
 * Accepts features as props. When loading=true renders skeleton placeholders.
 */

import { UsageMeter } from "./UsageMeter.js";

export interface UsageDashboardFeature {
  key: string;
  label: string;
  used: number;
  limit: number;
}

export interface UsageDashboardProps {
  features?: UsageDashboardFeature[];
  loading?: boolean;
}

export function UsageDashboard({
  features = [],
  loading = false,
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

  return (
    <div className="space-y-4">
      {features.map((f) => (
        <UsageMeter key={f.key} used={f.used} limit={f.limit} label={f.label} />
      ))}
    </div>
  );
}
