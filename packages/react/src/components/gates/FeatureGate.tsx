/**
 * Presentational entitlement gate. The merchant backend owns entitlement
 * retrieval; callers pass the resulting state into this component.
 */

"use client";

import React, { type ReactNode } from "react";

export interface FeatureGateProps {
  allowed: boolean;
  loading?: boolean;
  fallback?: ReactNode;
  children: ReactNode;
}

export function FeatureGate({
  allowed,
  loading = false,
  fallback = null,
  children,
}: FeatureGateProps): React.ReactElement | null {
  if (loading) return null;
  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}
