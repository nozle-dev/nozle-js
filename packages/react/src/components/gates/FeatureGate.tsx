/**
 * FeatureGate — Renders children if customer has access to a feature.
 * UI-03: Uses useCan hook; renders fallback when allowed=false.
 * Renders null while loading to avoid layout shift.
 */

"use client";

import React, { type ReactNode } from "react";
import { useCan } from '../../hooks/use-can.js';

export interface FeatureGateProps {
  /** Customer ID to check entitlement for */
  customerId: string;
  /** Feature key to check */
  feature: string;
  /** Rendered when customer does not have access. Defaults to null. */
  fallback?: ReactNode;
  /** Content to show when customer has access */
  children: ReactNode;
}

/**
 * FeatureGate renders children only when the customer is entitled to the feature.
 * Returns null while the entitlement check is loading.
 *
 * Usage:
 * ```tsx
 * <FeatureGate customerId="cus_123" feature="analytics" fallback={<UpgradePrompt />}>
 *   <AnalyticsDashboard />
 * </FeatureGate>
 * ```
 */
export function FeatureGate({
  customerId,
  feature,
  fallback = null,
  children,
}: FeatureGateProps): React.ReactElement | null {
  const { allowed, loading } = useCan(customerId, feature);

  if (loading) {
    return null;
  }

  if (!allowed) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
