/**
 * PlanComparison — Side-by-side feature comparison table.
 * UI-01: Renders shadcn-style table with plan names as headers and features as rows.
 * Check/cross icons for boolean values. Uses CSS variable theming.
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

export type ComparisonFeature = ComparisonRow;

export interface PlanComparisonProps {
  /** Plans from the public catalog. The rows are built from their entitlements and credit grants. */
  plans: PricingPlan[];
  /** Optional. Replaces the rows built from the plans. `values` is keyed by plan code. */
  features?: ComparisonFeature[];
  /** Optional. Orders the plans. By default they are sorted by base price, cheapest first. */
  sort?: (a: PricingPlan, b: PricingPlan) => number;
}

/**
 * PlanComparison renders a side-by-side comparison of catalog plans. A plan that does not have an
 * entitlement shows a cross, so the table shows the real difference between plans.
 */
export function PlanComparison({
  plans: catalogPlans,
  features: featureOverride,
  sort,
}: PlanComparisonProps): React.ReactElement {
  const plans = sort ? [...catalogPlans].sort(sort) : sortPlansByPrice(catalogPlans);
  const features = featureOverride ?? comparisonRows(plans);
  return (
    <div
      style={{
        overflowX: "auto",
        background: "var(--nozle-background, var(--background))",
      }}
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "0.875rem",
          color: "var(--nozle-foreground, var(--foreground))",
        }}
      >
        <thead>
          <tr>
            <th
              style={{
                padding: "0.75rem 1rem",
                textAlign: "left",
                borderBottom: "1px solid var(--nozle-border, var(--border))",
                color:
                  "var(--nozle-muted-foreground, var(--muted-foreground))",
                fontWeight: 500,
              }}
            >
              Feature
            </th>
            {plans.map((plan) => (
              <th
                key={plan.code}
                style={{
                  padding: "0.75rem 1rem",
                  textAlign: "center",
                  borderBottom: "1px solid var(--nozle-border, var(--border))",
                  fontWeight: 600,
                  color: "var(--nozle-foreground, var(--foreground))",
                }}
              >
                {plan.name}
                <div
                  style={{
                    fontWeight: 400,
                    color: "var(--nozle-muted-foreground, var(--muted-foreground))",
                  }}
                >
                  {formatPlanPrice(plan.amount_cents, plan.amount_currency)} / {intervalLabel(plan.interval)}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {features.map((feature) => (
            <tr key={feature.key}>
              <td
                style={{
                  padding: "0.75rem 1rem",
                  borderBottom: "1px solid var(--nozle-border, var(--border))",
                  color: "var(--nozle-foreground, var(--foreground))",
                }}
              >
                {feature.label}
              </td>
              {plans.map((plan) => {
                const value = feature.values[plan.code];
                return (
                  <td
                    key={plan.code}
                    style={{
                      padding: "0.75rem 1rem",
                      textAlign: "center",
                      borderBottom:
                        "1px solid var(--nozle-border, var(--border))",
                    }}
                  >
                    {typeof value === "boolean" ? (
                      value ? (
                        <span
                          style={{
                            color: "var(--nozle-primary, var(--primary))",
                          }}
                          aria-label="Included"
                        >
                          ✓
                        </span>
                      ) : (
                        <span
                          style={{
                            color:
                              "var(--nozle-muted-foreground, var(--muted-foreground))",
                          }}
                          aria-label="Not included"
                        >
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
  );
}
