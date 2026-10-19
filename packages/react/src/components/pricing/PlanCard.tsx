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
import { currentButtonStyle, planButtonState } from "./button-state.js";
import { T, border, buttonStyle, text, type Appearance } from "../../appearance/tokens.js";

export interface PlanCardProps {
  /** A plan from the public catalog. Its price and feature lines are read from it. */
  plan: PricingPlan;
  /** Optional. Replaces the lines read from the plan. */
  features?: string[];
  isCurrent: boolean;
  /**
   * Whether the plan costs more than the customer's current plan. Plans above it get the primary
   * button, the current plan its own look, and the rest the secondary one. Leave unset when there
   * is no current plan: the plan then gets the primary button.
   */
  isUpgrade?: boolean;
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
  isUpgrade,
  returnUrl,
  onSelect,
  appearance,
}: PlanCardProps): React.ReactElement {
  const { root, el, planCardLayout } = useAppearance(appearance, 'PlanCard');
  const { code: id, name, description } = plan;
  const price = formatPlanPrice(plan.amount_cents, plan.amount_currency);
  const interval = intervalLabel(plan.interval);
  const features = featureOverride ?? planFeatures(plan);

  const state = planButtonState({ isCurrent, isUpgrade });
  const cta = onSelect && (
    <button type="button"
      onClick={() =>
        onSelect?.({
          planCode: id,
          returnUrl: returnUrl ?? window.location.href,
        })
      }
      {...el("planCard__cta", {
        ...(isCurrent ? currentButtonStyle : buttonStyle(state === "secondary" ? "secondary" : "primary")),
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
        ...text.body,
        background: T.card,
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
        <h3 {...el("planCard__name", { ...text.heading, margin: 0 })}>{name}</h3>
        {description && (
          <p {...el("planCard__description", { ...text.secondary, margin: "0.25rem 0 0" })}>
            {description}
          </p>
        )}
      </div>

      <div {...el("planCard__price")}>
        <span style={text.metric}>{price}</span>
        <span style={{ ...text.meta, marginLeft: "0.25rem" }}>/{interval}</span>
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
          <li key={feature} {...el("planCard__feature", { display: "flex", alignItems: "center", gap: "0.5rem", ...text.body })}>
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
