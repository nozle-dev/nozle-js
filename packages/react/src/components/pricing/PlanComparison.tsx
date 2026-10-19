/**
 * PlanComparison — Side-by-side feature comparison table.
 * UI-01: Renders shadcn-style table with plan names as headers and features as rows.
 * Check/cross icons for boolean values. Themed through `appearance`.
 */

"use client";
import React from "react";

import type { PricingPlan } from "./PricingTable.js";
import {
  comparisonRows,
  formatPlanPrice,
  intervalLabel,
  sortPlansByPrice,
  type ComparisonRow,
} from "./plan-features.js";
import { useAppearance } from "../../appearance/context.js";
import { NozleBranding } from "../branding/PoweredByNozle.js";
import { T, table, text, type Appearance } from "../../appearance/tokens.js";

export type ComparisonFeature = ComparisonRow;

export interface PlanComparisonProps {
  /** Plans from the public catalog. The rows are built from their entitlements and credit grants. */
  plans: PricingPlan[];
  /** Optional. Replaces the rows built from the plans. `values` is keyed by plan code. */
  features?: ComparisonFeature[];
  /** Optional. Orders the plans. By default they are sorted by base price, cheapest first. */
  sort?: (a: PricingPlan, b: PricingPlan) => number;
  appearance?: Appearance;
}

/**
 * PlanComparison renders a side-by-side comparison of catalog plans. A plan that does not have an
 * entitlement shows a cross, so the table shows the real difference between plans.
 */
export function PlanComparison({
  plans: catalogPlans,
  features: featureOverride,
  sort,
  appearance,
}: PlanComparisonProps): React.ReactElement {
  const { root, el } = useAppearance(appearance, 'PlanComparison');
  const plans = sort ? [...catalogPlans].sort(sort) : sortPlansByPrice(catalogPlans);
  const features = featureOverride ?? comparisonRows(plans);
  const cell = (style: React.CSSProperties) => el("planComparison__cell", style);
  return (
    <div {...root("planComparison", { minWidth: 0 })}>
    <div style={table.frame}>
      <table {...el("planComparison__table", table.table)}>
        <thead>
          <tr>
            <th {...cell(table.head())}>Feature</th>
            {plans.map((plan) => (
              <th key={plan.code} {...cell({ ...table.head(), textAlign: "center", padding: "10px 20px" })}>
                {plan.name}
                <div style={{ ...text.meta, letterSpacing: "normal", textTransform: "none" }}>
                  {formatPlanPrice(plan.amount_cents, plan.amount_currency)} / {intervalLabel(plan.interval)}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {features.map((feature, index) => (
            <tr key={feature.key} {...el("planComparison__row")}>
              <td {...cell(table.cell(false, index === features.length - 1))}>{feature.label}</td>
              {plans.map((plan) => {
                const value = feature.values[plan.code];
                return (
                  <td key={plan.code} {...cell({ ...table.cell(false, index === features.length - 1), textAlign: "center" })}>
                    {typeof value === "boolean" ? (
                      value ? (
                        <span style={{ color: T.primary }} aria-label="Included">
                          ✓
                        </span>
                      ) : (
                        <span style={{ color: T.mutedForeground }} aria-label="Not included">
                          ✕
                        </span>
                      )
                    ) : (
                      <span>{value ?? "—"}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <NozleBranding />
    </div>
  );
}
