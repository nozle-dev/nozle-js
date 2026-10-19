"use client";

import React from "react";
import { useAppearance } from "../../appearance/context.js";
import { T, border as themeBorder, surface, text, type Appearance } from "../../appearance/tokens.js";
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
  appearance?: Appearance;
}

const muted = T.mutedForeground;
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
  appearance,
}: UsageTrendProps): React.ReactElement {
  const { root, el } = useAppearance(appearance, 'UsageTrend');
  if (isLoading) return <div {...root("usageTrend", { ...surface, height: 160, background: T.skeleton })} role="status" aria-label="Loading usage trend" />;
  if (error) return <p {...root("usageTrend", { ...surface, color: T.dangerText })} role="alert">{typeof error === "string" ? error : error.message}</p>;
  if (!periods || periods.length === 0) return <p {...root("usageTrend", { ...surface, color: muted })} role="status">{emptyMessage}</p>;

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
    <figure {...root("usageTrend", { ...surface, margin: 0 })}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: "0.5rem", height: BAR_AREA + 40 }}>
        {points.map((point) => (
          <div key={point.key} style={{ ...text.meta, flex: 1, minWidth: 0, textAlign: "center" }}>
            <div>{point.text}</div>
            <div
              role="img"
              aria-label={`${point.label}: ${point.text}`}
              title={`${point.label}: ${point.text}`}
              {...el("usageTrend__bar", {
                height: max > 0 ? Math.max(2, (point.value / max) * BAR_AREA) : 2,
                marginTop: 4,
                borderRadius: `min(4px, ${T.radius}) min(4px, ${T.radius}) 0 0`,
                background: T.primary,
              })}
            />
            <div style={{ marginTop: 4 }}>{point.label}</div>
          </div>
        ))}
      </div>
    </figure>
  );
}
