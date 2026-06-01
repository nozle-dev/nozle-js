/**
 * BillingPortalProvider — Context wrapper for embeddable SDK components.
 * UI-01: Wraps children and exposes a React context with { customerId, apiKey }.
 * Components inside can consume this via the useBillingPortal() hook.
 *
 * Internally renders BillingProvider so all billing hooks work inside.
 */

"use client";
import React from "react";

import { createContext, useContext, type ReactNode } from "react";

export interface BillingPortalContextValue {
  customerId: string;
  apiKey: string;
}

const BillingPortalContext = createContext<BillingPortalContextValue | null>(
  null,
);

export function useBillingPortal(): BillingPortalContextValue {
  const ctx = useContext(BillingPortalContext);
  if (!ctx) {
    throw new Error(
      "useBillingPortal must be used inside BillingPortalProvider",
    );
  }
  return ctx;
}

export interface BillingPortalProviderProps {
  customerId: string;
  apiKey: string;
  children: ReactNode;
}

/**
 * BillingPortalProvider wraps your embedded billing UI and provides
 * { customerId, apiKey } context to all nested SDK components.
 *
 * Usage:
 * ```tsx
 * <BillingPortalProvider customerId="cus_xxx" apiKey="bsr_pk_xxx">
 *   <PricingTable plans={plans} />
 *   <FeatureGate feature="analytics" />
 * </BillingPortalProvider>
 * ```
 */
export function BillingPortalProvider({
  customerId,
  apiKey,
  children,
}: BillingPortalProviderProps): React.ReactElement {
  return (
    <BillingPortalContext.Provider value={{ customerId, apiKey }}>
      {children}
    </BillingPortalContext.Provider>
  );
}
