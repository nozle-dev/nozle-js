"use client";

import React, {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

export interface CheckoutSubscriptionResult {
  external_entity_id?: string;
  external_subscription_id?: string;
  checkout_id?: string;
  effective_at?: string;
  renewal_at?: string | null;
  amount_due_cents?: number | string;
  currency?: string;
}

export interface CompletedCheckoutResult extends CheckoutSubscriptionResult {
  type: "completed";
  status: string;
  payment_source?: string;
  subscription_id?: string;
  plan_code?: string;
  invoice_id?: string;
  amount_cents?: number;
  currency?: string;
}

export interface ScheduledCheckoutResult extends CheckoutSubscriptionResult {
  type: "scheduled";
  status: string;
  subscription_id?: string;
  plan_code?: string;
  effective_at?: string;
  pending_subscription_id?: string;
}

export interface RazorpayCheckoutResult {
  type: "razorpay";
  checkout_id: string;
  key_id: string;
  order_id: string;
  amount_cents: number;
  currency: string;
  expires_at?: string;
  invoice_id?: string;
  customer_id?: string;
  recurring?: boolean;
  mandate_max_amount_cents?: number;
}

export interface ProcessingCheckoutResult {
  type: "processing";
  checkout_id: string;
  status: string;
}

export interface HostedCheckoutResult {
  type: "hosted";
  payment_url: string;
  checkout_id?: string;
}

export interface RazorpayVerification {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface CheckoutStatus {
  checkout_id: string;
  provider: "razorpay" | "stripe";
  status:
    | "processing"
    | "awaiting_payment"
    | "succeeded"
    | "failed"
    | "expired"
    | "needs_review";
  fulfillment_status: "pending" | "processing" | "succeeded";
  amount_cents?: number;
  currency?: string;
  invoice_id?: string | null;
  checkout?: CheckoutResult;
}

/** Call your authenticated merchant backend, which calls Nozle using its secret key. */
export type VerifyCheckout = (
  checkoutId: string,
  verification: RazorpayVerification,
) => Promise<CheckoutStatus>;
export type GetCheckoutStatus = (checkoutId: string) => Promise<CheckoutStatus>;

export type CheckoutResult =
  | {
      type: "stripe";
      url?: string;
      clientSecret?: string;
      client_secret?: string;
      publishable_key?: string;
      stripe_account?: string;
      checkout_id?: string;
      invoice_id?: string;
      amount_cents?: number;
      currency?: string;
      external_entity_id?: string;
      external_subscription_id?: string;
    }
  | RazorpayCheckoutResult
  | ProcessingCheckoutResult
  | HostedCheckoutResult
  | CompletedCheckoutResult
  | ScheduledCheckoutResult
  | { url: string };

export interface CreateCheckoutInput {
  planCode: string;
  returnUrl: string;
  idempotencyKey?: string;
  registerMandate?: boolean;
  /** Select the customer's external subscription for a plan change. */
  subscriptionId?: string;
  /** Opaque, server-issued confirmation for the displayed quote. */
  quoteId?: string;
}

export type CreateCheckout = (
  input: CreateCheckoutInput,
) => Promise<CheckoutResult>;

export interface NozleClient {
  publishableKey: string;
  baseUrl: string;
  catalogFetch(path: string, init?: RequestInit): Promise<Response>;
}

function createClient(publishableKey: string, baseUrl: string): NozleClient {
  let end = baseUrl.length;
  while (end > 0 && baseUrl[end - 1] === "/") end--;
  const base = baseUrl.slice(0, end);

  return {
    publishableKey,
    baseUrl: base,
    catalogFetch(path: string, init?: RequestInit): Promise<Response> {
      return fetch(`${base}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${publishableKey}`,
          "Content-Type": "application/json",
          ...init?.headers,
        },
      });
    },
  };
}

export interface BillingContextValue {
  client: NozleClient;
  createCheckout?: CreateCheckout;
  verifyCheckout?: VerifyCheckout;
  getCheckoutStatus?: GetCheckoutStatus;
}

export const BillingContext = createContext<BillingContextValue | null>(null);

export interface BillingProviderProps {
  publishableKey: string;
  createCheckout?: CreateCheckout;
  verifyCheckout?: VerifyCheckout;
  getCheckoutStatus?: GetCheckoutStatus;
  baseUrl?: string;
  children: ReactNode;
}

export function BillingProvider({
  publishableKey,
  createCheckout,
  verifyCheckout,
  getCheckoutStatus,
  baseUrl = "https://api.nozle.app/engine",
  children,
}: BillingProviderProps): React.ReactElement {
  if (!publishableKey.startsWith("pk_")) {
    throw new Error(
      "BillingProvider publishableKey must be a publishable key (pk_)",
    );
  }

  const client = useMemo(
    () => createClient(publishableKey, baseUrl),
    [publishableKey, baseUrl],
  );
  const contextValue = useMemo(
    () => ({ client, createCheckout, verifyCheckout, getCheckoutStatus }),
    [client, createCheckout, verifyCheckout, getCheckoutStatus],
  );

  return React.createElement(
    BillingContext.Provider,
    { value: contextValue },
    children,
  );
}

export function useOptionalBillingContext(): BillingContextValue | null {
  return useContext(BillingContext);
}

export function useBillingContext(): BillingContextValue {
  const context = useOptionalBillingContext();
  if (!context) {
    throw new Error("useBillingContext must be used within a BillingProvider");
  }
  return context;
}

export function useNozleClient(): NozleClient {
  return useBillingContext().client;
}
