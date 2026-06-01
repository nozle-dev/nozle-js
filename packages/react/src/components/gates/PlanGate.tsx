/**
 * PlanGate — Renders children if customer's plan is in the allowed list.
 * UI-03: Pure render logic — caller provides currentPlan and allowedPlans.
 * Renders fallback when customer is not on an allowed plan tier.
 */

"use client";

import React, { type ReactNode } from "react";

export interface PlanGateProps {
  /** The customer's current plan identifier */
  currentPlan: string;
  /** List of plan identifiers that are allowed to see the children */
  allowedPlans: string[];
  /** Rendered when customer is not on an allowed plan. Defaults to null. */
  fallback?: ReactNode;
  /** Content to show when customer is on an allowed plan */
  children: ReactNode;
}

/**
 * PlanGate renders children only when the customer's currentPlan is in allowedPlans.
 * When not on an allowed plan, renders fallback.
 *
 * Usage:
 * ```tsx
 * <PlanGate
 *   currentPlan={customer.plan}
 *   allowedPlans={['pro', 'enterprise']}
 *   fallback={<UpgradePrompt planName="Pro" />}
 * >
 *   <ProFeature />
 * </PlanGate>
 * ```
 */
export function PlanGate({
  currentPlan,
  allowedPlans,
  fallback = null,
  children,
}: PlanGateProps): React.ReactElement {
  if (!allowedPlans.includes(currentPlan)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
