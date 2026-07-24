/**
 * PlanCard — Individual pricing plan card component.
 * UI-01: Shows plan name, price, interval, features list, and CTA button.
 * Uses CSS variable theming with --nozle-* namespace.
 */

"use client";
import React from "react";

import type { ReactNode } from "react";
import type { CreateCheckoutInput } from "../../provider.js";

export interface Plan {
  id: string;
  name: string;
  monthlyPrice: number;
  annualPrice: number;
  features: string[];
  description?: string;
}

export interface PlanCardProps extends Plan {
  isAnnual: boolean;
  isCurrent: boolean;
  returnUrl?: string;
  onSelect?: (input: CreateCheckoutInput) => void;
  children?: ReactNode;
}

/**
 * PlanCard renders a single pricing plan.
 * Highlighted with aria-current="true" when isCurrent=true.
 */
export function PlanCard({
  id,
  name,
  monthlyPrice,
  annualPrice,
  features,
  description,
  isAnnual,
  isCurrent,
  returnUrl,
  onSelect,
}: PlanCardProps): React.ReactElement {
  const price = isAnnual ? annualPrice : monthlyPrice;
  const interval = isAnnual ? "year" : "month";

  return (
    <div
      data-testid={`plan-card-${id}`}
      aria-current={isCurrent ? "true" : undefined}
      style={{
        background: "var(--nozle-background, var(--background))",
        border: isCurrent
          ? "2px solid var(--nozle-primary, var(--primary))"
          : "1px solid var(--nozle-border, var(--border))",
        borderRadius: "var(--nozle-radius, 0.5rem)",
        padding: "1.5rem",
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
      }}
      className={isCurrent ? "border-primary" : ""}
    >
      <div>
        <h3
          style={{
            fontSize: "1.25rem",
            fontWeight: 600,
            color: "var(--nozle-foreground, var(--foreground))",
            margin: 0,
          }}
        >
          {name}
        </h3>
        {description && (
          <p
            style={{
              color: "var(--nozle-muted-foreground, var(--muted-foreground))",
              fontSize: "0.875rem",
              margin: "0.25rem 0 0",
            }}
          >
            {description}
          </p>
        )}
      </div>

      <div>
        <span
          style={{
            fontSize: "2rem",
            fontWeight: 700,
            color: "var(--nozle-foreground, var(--foreground))",
          }}
        >
          ${price}
        </span>
        <span
          style={{
            color: "var(--nozle-muted-foreground, var(--muted-foreground))",
            marginLeft: "0.25rem",
          }}
        >
          /{interval}
        </span>
      </div>

      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          flex: 1,
        }}
      >
        {features.map((feature) => (
          <li
            key={feature}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              color: "var(--nozle-foreground, var(--foreground))",
              fontSize: "0.875rem",
            }}
          >
            <span
              style={{ color: "var(--nozle-primary, var(--primary))" }}
              aria-hidden="true"
            >
              ✓
            </span>
            {feature}
          </li>
        ))}
      </ul>

      {onSelect && (
        <button
          onClick={() =>
            onSelect?.({
              planCode: id,
              returnUrl: returnUrl ?? window.location.href,
            })
          }
          style={{
            background: isCurrent
              ? "var(--nozle-muted, var(--muted))"
              : "var(--nozle-primary, var(--primary))",
            color: isCurrent
              ? "var(--nozle-muted-foreground, var(--muted-foreground))"
              : "var(--nozle-primary-foreground, var(--primary-foreground))",
            border: "none",
            borderRadius: "var(--nozle-radius, 0.5rem)",
            padding: "0.75rem 1.5rem",
            cursor: isCurrent ? "default" : "pointer",
            fontWeight: 500,
            width: "100%",
          }}
          disabled={isCurrent}
          aria-label={isCurrent ? `Current plan: ${name}` : `Select ${name}`}
        >
          {isCurrent ? "Current Plan" : "Get Started"}
        </button>
      )}
    </div>
  );
}
