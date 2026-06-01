/**
 * PricingTable — Renders plan cards with monthly/annual toggle.
 * UI-01: Responsive grid, monthly/annual toggle, highlights currentPlanId.
 * Uses CSS variable theming with --nozle-* namespace.
 */

"use client";
import React from "react";

import { useState } from "react";
import { PlanCard, type Plan } from "./PlanCard.js";

export interface PricingTableProps {
  plans: Plan[];
  currentPlanId?: string;
  onSelect?: (planId: string) => void;
}

/**
 * PricingTable renders plan cards in a responsive grid with monthly/annual toggle.
 * The current plan is highlighted with aria-current="true" and border-primary class.
 *
 * Usage:
 * ```tsx
 * <PricingTable
 *   plans={plans}
 *   currentPlanId="pro"
 *   onSelect={(planId) => handleUpgrade(planId)}
 * />
 * ```
 */
export function PricingTable({
  plans,
  currentPlanId,
  onSelect,
}: PricingTableProps): React.ReactElement {
  const [isAnnual, setIsAnnual] = useState(false);

  return (
    <div
      style={{
        background: "var(--nozle-background, var(--background))",
        color: "var(--nozle-foreground, var(--foreground))",
      }}
    >
      {/* Monthly / Annual toggle */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          justifyContent: "center",
          marginBottom: "1.5rem",
        }}
      >
        <button
          onClick={() => setIsAnnual(false)}
          style={{
            padding: "0.5rem 1rem",
            borderRadius: "var(--nozle-radius, 0.5rem)",
            border: "1px solid var(--nozle-border, var(--border))",
            background: !isAnnual
              ? "var(--nozle-primary, var(--primary))"
              : "transparent",
            color: !isAnnual
              ? "var(--nozle-primary-foreground, var(--primary-foreground))"
              : "var(--nozle-foreground, var(--foreground))",
            cursor: "pointer",
            fontWeight: !isAnnual ? 600 : 400,
          }}
          aria-pressed={!isAnnual}
        >
          Monthly
        </button>
        <button
          onClick={() => setIsAnnual(true)}
          style={{
            padding: "0.5rem 1rem",
            borderRadius: "var(--nozle-radius, 0.5rem)",
            border: "1px solid var(--nozle-border, var(--border))",
            background: isAnnual
              ? "var(--nozle-primary, var(--primary))"
              : "transparent",
            color: isAnnual
              ? "var(--nozle-primary-foreground, var(--primary-foreground))"
              : "var(--nozle-foreground, var(--foreground))",
            cursor: "pointer",
            fontWeight: isAnnual ? 600 : 400,
          }}
          aria-pressed={isAnnual}
        >
          Annual
        </button>
      </div>

      {/* Plan cards grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${Math.min(plans.length, 3)}, 1fr)`,
          gap: "1rem",
        }}
      >
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            {...plan}
            isAnnual={isAnnual}
            isCurrent={plan.id === currentPlanId}
            onSelect={onSelect ? () => onSelect(plan.id) : undefined}
          />
        ))}
      </div>
    </div>
  );
}
