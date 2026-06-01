/**
 * PlanComparison — Side-by-side feature comparison table.
 * UI-01: Renders shadcn-style table with plan names as headers and features as rows.
 * Check/cross icons for boolean values. Uses CSS variable theming.
 */

"use client";
import React from "react";

import type { Plan } from "./PlanCard.js";

export interface ComparisonFeature {
  key: string;
  label: string;
  values: Record<string, string | boolean>;
}

export interface PlanComparisonProps {
  plans: Plan[];
  features: ComparisonFeature[];
}

/**
 * PlanComparison renders a side-by-side feature comparison table.
 *
 * Usage:
 * ```tsx
 * <PlanComparison
 *   plans={plans}
 *   features={[
 *     { key: 'api_calls', label: 'API Calls', values: { starter: '10K', pro: '100K' } },
 *     { key: 'analytics', label: 'Analytics', values: { starter: false, pro: true } },
 *   ]}
 * />
 * ```
 */
export function PlanComparison({
  plans,
  features,
}: PlanComparisonProps): React.ReactElement {
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
                key={plan.id}
                style={{
                  padding: "0.75rem 1rem",
                  textAlign: "center",
                  borderBottom: "1px solid var(--nozle-border, var(--border))",
                  fontWeight: 600,
                  color: "var(--nozle-foreground, var(--foreground))",
                }}
              >
                {plan.name}
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
                const value = feature.values[plan.id];
                return (
                  <td
                    key={plan.id}
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
