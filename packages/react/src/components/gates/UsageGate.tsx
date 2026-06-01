/**
 * UsageGate — Renders children if usage is below limit.
 * UI-03: Renders fallback when usage >= limit.
 * Pure render logic — caller provides usage and limit values.
 */

"use client";

import React, { type ReactNode } from "react";

export interface UsageGateProps {
  /** Current usage value */
  usage: number;
  /** Usage limit */
  limit: number;
  /** Rendered when usage is at or above limit. Defaults to null. */
  fallback?: ReactNode;
  /** Content to show when usage is below limit */
  children: ReactNode;
}

/**
 * UsageGate renders children only when current usage is below the limit.
 * When usage >= limit, renders fallback.
 *
 * Usage:
 * ```tsx
 * <UsageGate usage={currentUsage} limit={plan.apiCallLimit} fallback={<UpgradePrompt />}>
 *   <ApiCallButton />
 * </UsageGate>
 * ```
 */
export function UsageGate({
  usage,
  limit,
  fallback = null,
  children,
}: UsageGateProps): React.ReactElement {
  if (usage >= limit) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
