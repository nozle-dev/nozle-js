"use client";

import React from "react";
import { formatAmount, formatDay, type CustomerUsageData } from "./usage-data.js";

export interface UsageTrendProps {
  /** The `usage_periods` of Core's `past_usage`, read on your backend, in any order. */
  periods?: CustomerUsageData[] | null;
  /**
   * Chart the units of this feature code in each period instead of the amount. Periods without the
   * feature show zero.
   */
  featureCode?: string;
  isLoading?: boolean;
  error?: Error | string | null;
  emptyMessage?: string;
}

const muted = "var(--nozle-muted-foreground, var(--muted-foreground))";
const BAR_AREA = 120;

function unitsFor(period: CustomerUsageData, featureCode: string): number {
  return period.charges_usage
    .filter((charge) => charge.feature.code === featureCode)
    .reduce((sum, charge) => sum + (Number(charge.units) || 0), 0);
}

export function UsageTrend({
  periods,
  featureCode,
  isLoading = false,
  error = null,
  emptyMessage = "No past usage yet.",
}: UsageTrendProps): React.ReactElement {
  if (isLoading) return <div role="status" aria-label="Loading usage trend" style={{ height: 160, borderRadius: 8, background: "var(--nozle-border, var(--border))" }} />;
  if (error) return <p role="alert">{typeof error === "string" ? error : error.message}</p>;
  if (!periods || periods.length === 0) return <p role="status">{emptyMessage}</p>;

  const ordered = [...periods].sort((a, b) => Date.parse(a.from_datetime) - Date.parse(b.from_datetime));
  const points = ordered.map((period) => ({
    key: period.from_datetime,
    label: formatDay(period.from_datetime),
    value: featureCode ? unitsFor(period, featureCode) : period.amount_cents,
    text: featureCode
      ? `${unitsFor(period, featureCode).toLocaleString("en-US")} ${featureCode}`
      : formatAmount(period.amount_cents, period.currency),
  }));
  const max = Math.max(...points.map((point) => point.value), 0);

  return (
    <figure style={{ margin: 0, color: "var(--nozle-foreground, var(--foreground))" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: "0.5rem", height: BAR_AREA + 40 }}>
        {points.map((point) => (
          <div key={point.key} style={{ flex: 1, minWidth: 0, textAlign: "center", fontSize: "0.75rem" }}>
            <div style={{ color: muted }}>{point.text}</div>
            <div
              role="img"
              aria-label={`${point.label}: ${point.text}`}
              title={`${point.label}: ${point.text}`}
              style={{
                height: max > 0 ? Math.max(2, (point.value / max) * BAR_AREA) : 2,
                marginTop: 4,
                borderRadius: "4px 4px 0 0",
                background: "var(--nozle-primary, var(--primary))",
              }}
            />
            <div style={{ marginTop: 4, color: muted }}>{point.label}</div>
          </div>
        ))}
      </div>
    </figure>
  );
}
