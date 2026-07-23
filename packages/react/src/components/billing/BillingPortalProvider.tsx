/**
 * BillingPortalProvider — Context wrapper for embeddable SDK components.
 * UI-01: Wraps children and exposes a customer-bound session.
 * Components inside can consume this via the useBillingPortal() hook.
 *
 * Internally renders BillingProvider so all billing hooks work inside.
 */

"use client";
import React from "react";

import { createContext, useContext, type ReactNode } from "react";

export interface BillingPortalContextValue {
  customerId: string;
  customerSessionToken: string;
  /** @deprecated Use customerSessionToken. */
  apiKey: string;
  apiBaseUrl: string;
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

export function useOptionalBillingPortal(): BillingPortalContextValue | null {
  return useContext(BillingPortalContext);
}

export interface BillingPortalProviderProps {
  customerId: string;
  customerSessionToken?: string;
  /** @deprecated Pass a csess_ token via customerSessionToken. PK/SK values are rejected. */
  apiKey?: string;
  apiBaseUrl?: string;
  children: ReactNode;
}

/**
 * BillingPortalProvider wraps your embedded billing UI and provides
 * { customerId, customerSessionToken } context to all nested SDK components.
 *
 * Usage:
 * ```tsx
 * <BillingPortalProvider customerId="cus_xxx" customerSessionToken="csess_xxx">
 *   <PricingTable plans={plans} />
 *   <FeatureGate feature="analytics" />
 * </BillingPortalProvider>
 * ```
 */
export function BillingPortalProvider({
  customerId,
  customerSessionToken,
  apiKey,
  apiBaseUrl = "https://api.nozle.app",
  children,
}: BillingPortalProviderProps): React.ReactElement {
  const resolvedSessionToken = customerSessionToken ?? apiKey;
  if (!resolvedSessionToken?.startsWith("csess_")) {
    throw new Error(
      "BillingPortalProvider requires a scoped customerSessionToken (csess_); publishable and secret keys are not browser billing credentials",
    );
  }
  return (
    <BillingPortalContext.Provider
      value={{
        customerId,
        customerSessionToken: resolvedSessionToken,
        apiKey: resolvedSessionToken,
        apiBaseUrl,
      }}
    >
      {children}
    </BillingPortalContext.Provider>
  );
}
