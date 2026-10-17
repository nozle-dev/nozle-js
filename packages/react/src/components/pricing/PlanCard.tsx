/**
 * PlanCard — Individual pricing plan card component.
 * UI-01: Shows plan name, price, interval, features list, and CTA button.
 * Themed through `appearance` (see the appearance tokens).
 */

"use client";
import React from "react";

import type { CreateCheckoutInput } from "../../provider.js";
import type { PricingPlan } from "./PricingTable.js";
import { formatPlanPrice, intervalLabel, planFeatures } from "./plan-features.js";
import { useAppearance, type ElementProps } from "../../appearance/context.js";
import { PanelPlanCard } from "./PanelPlanCard.js";
import { T, border, buttonStyle, type Appearance } from "../../appearance/tokens.js";

export interface PlanCardProps {
  /** A plan from the public catalog. Its price and feature lines are read from it. */
  plan: PricingPlan;
  /** Optional. Replaces the lines read from the plan. */
  features?: string[];
  isCurrent: boolean;
  returnUrl?: string;
  onSelect?: (input: CreateCheckoutInput) => void;
  appearance?: Appearance;
}

/**
 * PlanCard renders a single pricing plan from the catalog.
 * Highlighted with aria-current="true" when isCurrent=true.
 */
export function PlanCard({
  plan,
  features: featureOverride,
  isCurrent,
  returnUrl,
  onSelect,
  appearance,
}: PlanCardProps): React.ReactElement {
  const { root, el, planCardLayout } = useAppearance(appearance);
  const { code: id, name, description } = plan;
  const price = formatPlanPrice(plan.amount_cents, plan.amount_currency);
  const interval = intervalLabel(plan.interval);
  const features = featureOverride ?? planFeatures(plan);

  const cta = onSelect && (
    <button
      onClick={() =>
        onSelect?.({
          planCode: id,
          returnUrl: returnUrl ?? window.location.href,
        })
      }
      {...el("planCard__cta", {
        ...buttonStyle(isCurrent ? "secondary" : "primary"),
        ...(isCurrent && { background: T.muted, color: T.mutedForeground, cursor: "default" }),
        width: "100%",
      })}
      disabled={isCurrent}
      aria-label={isCurrent ? `Current plan: ${name}` : `Select ${name}`}
    >
      {isCurrent ? "Current Plan" : "Get Started"}
    </button>
  );

  if (planCardLayout === "panel") {
    return (
      <PanelPlanCard
        frame={(style) => ({ "data-testid": `plan-card-${id}`, "aria-current": isCurrent ? "true" : undefined, ...root("planCard", style) }) as ElementProps}
        el={el}
        name={name}
        description={description}
        price={price}
        interval={interval}
        features={features}
        isCurrent={Boolean(isCurrent)}
        isHighlighted={false}
        filled={false}
      >
        {cta}
      </PanelPlanCard>
    );
  }

  return (
    <div
      data-testid={`plan-card-${id}`}
      aria-current={isCurrent ? "true" : undefined}
      {...root("planCard", {
        background: T.card,
        color: T.foreground,
        fontFamily: T.font,
        border: border(isCurrent ? T.primary : T.border),
        outline: isCurrent ? `1px solid ${T.primary}` : undefined,
        borderRadius: T.radius,
        boxShadow: T.shadow,
        padding: "1.5rem",
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
      })}
    >
      <div>
        <h3 {...el("planCard__name", { fontSize: "1.25rem", fontWeight: 600, margin: 0 })}>{name}</h3>
        {description && (
          <p {...el("planCard__description", { color: T.mutedForeground, fontSize: "0.875rem", margin: "0.25rem 0 0" })}>
            {description}
          </p>
        )}
      </div>

      <div {...el("planCard__price")}>
        <span style={{ fontSize: "2rem", fontWeight: 700 }}>{price}</span>
        <span style={{ color: T.mutedForeground, marginLeft: "0.25rem" }}>/{interval}</span>
      </div>

      <ul
        {...el("planCard__features", {
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          flex: 1,
        })}
      >
        {features.map((feature) => (
          <li key={feature} {...el("planCard__feature", { display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem" })}>
            <span style={{ color: T.primary }} aria-hidden="true">
              ✓
            </span>
            {feature}
          </li>
        ))}
      </ul>

      {cta}
    </div>
  );
}
