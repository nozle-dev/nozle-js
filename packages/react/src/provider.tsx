"use client";

import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { QueryClient, useQuery } from "@tanstack/react-query";
import { catalogQuery } from "./hooks/use-plans.js";
import { AppearanceProvider } from "./appearance/context.js";
import type { Appearance } from "./appearance/tokens.js";

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
  /** `credits` or `none`. */
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
  /** `upgrade` or `downgrade`. */
  transition_direction?: string;
  transition_policy?: string;
}

export interface RazorpayCheckoutResult {
  type: "razorpay";
  checkout_id: string;
  key_id: string;
  order_id: string;
  amount_cents: number;
  currency: string;
  expires_at?: string;
  /** Set for an invoice checkout. A paid upgrade returns `plan_upgrade_intent_id` instead. */
  invoice_id?: string;
  plan_upgrade_intent_id?: string;
  external_entity_id?: string;
  external_subscription_id?: string;
  customer_id?: string;
  recurring?: boolean;
  mandate_max_amount_cents?: number;
}

/**
 * The checkout is not ready to collect payment yet: Razorpay while the order is
 * being created, and Stripe when a quoted upgrade is replayed while its webhook is
 * still pending. Recover with the checkout status call using `checkout_id`.
 */
export interface ProcessingCheckoutResult {
  type: "processing";
  checkout_id: string;
  status: string;
  amount_cents?: number;
  currency?: string;
  expires_at?: string;
  invoice_id?: string;
  plan_upgrade_intent_id?: string;
}

/** A hosted payment page (Stripe Checkout or a Razorpay payment link). The customer is redirected to `url`. */
export interface HostedCheckoutResult {
  type: "hosted";
  url: string;
  payment_url?: string;
  checkout_id?: string;
  amount_cents?: number;
  currency?: string;
  expires_at?: string;
  invoice_id?: string;
  plan_upgrade_intent_id?: string;
  external_entity_id?: string;
  external_subscription_id?: string;
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
  | RazorpayCheckoutResult
  | ProcessingCheckoutResult
  | HostedCheckoutResult
  | CompletedCheckoutResult
  | ScheduledCheckoutResult
  | { url: string };

export interface CreateCheckoutInput {
  planCode: string;
  returnUrl: string;
  /** Where the hosted page sends a customer who leaves it. Pass it on to `nozle.checkout()` as `cancelUrl`. */
  cancelUrl?: string;
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

/** What your backend returns from `nozle.managePaymentMethod()`. Stripe only; Razorpay customers pay each invoice by payment link. */
export interface ManagePaymentMethodResult {
  url: string;
  expires_at: string | null;
  provider: "stripe";
}

export type CreateManagePaymentMethod = (input: {
  returnUrl: string;
  idempotencyKey?: string;
}) => Promise<ManagePaymentMethodResult>;

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

/** A failed request to your billing endpoint. `code` is the error code the endpoint returned. */
export class BillingRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    readonly requestId?: string,
  ) {
    super(`Billing request failed: ${status}${code ? ` ${code}` : ""}`);
    this.name = "BillingRequestError";
  }
}

export type BillingFetch = <T>(route: string, params?: Record<string, string | number | undefined>) => Promise<T>;

export interface BillingContextValue {
  client: NozleClient;
  createCheckout?: CreateCheckout;
  verifyCheckout?: VerifyCheckout;
  getCheckoutStatus?: GetCheckoutStatus;
  /** Calls your backend, which calls `managePaymentMethod` with its secret key. */
  createManagePaymentMethod?: CreateManagePaymentMethod;
  /** The query client the billing hooks use: the `queryClient` prop, or one the provider made. */
  queryClient: QueryClient;
  /** Reads a route of your billing endpoint; undefined when `billingEndpoint` is not set. */
  billingFetch?: BillingFetch;
  billingEndpoint?: string;
}

function createBillingFetch(
  endpoint: string,
  headers?: () => HeadersInit | Promise<HeadersInit>,
): BillingFetch {
  // Trim trailing slashes without a regex: /\/+$/ is quadratic on long runs of "/".
  let end = endpoint.length;
  while (end > 0 && endpoint[end - 1] === "/") end--;
  const base = endpoint.slice(0, end);
  return async <T,>(route: string, params: Record<string, string | number | undefined> = {}) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") query.set(key, String(value));
    }
    const search = query.toString();
    const response = await fetch(`${base}/${route}${search ? `?${search}` : ""}`, {
      credentials: "same-origin",
      headers: { Accept: "application/json", ...(headers ? await headers() : {}) },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { code?: string; request_id?: string };
      throw new BillingRequestError(response.status, body.code, body.request_id);
    }
    return (await response.json()) as T;
  };
}

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Retry only failures that may pass on a second try; a 4xx will not.
        retry: (count, error) =>
          count < 2 && !(error instanceof BillingRequestError && error.status < 500),
      },
    },
  });
}

export const BillingContext = createContext<BillingContextValue | null>(null);

export interface BillingProviderProps {
  publishableKey: string;
  createCheckout?: CreateCheckout;
  verifyCheckout?: VerifyCheckout;
  getCheckoutStatus?: GetCheckoutStatus;
  createManagePaymentMethod?: CreateManagePaymentMethod;
  baseUrl?: string;
  /**
   * Path of your backend route that serves the customer hooks (`useSubscription`,
   * `useEntitlement`, `useCreditBalance`, `useCreditHistory`, `useUsage`, `useUpgradePreview`),
   * for example `/api/nozle`. Serve it with `createBillingHandler` from `@nozle-js/node`.
   */
  billingEndpoint?: string;
  /** Extra headers for billing endpoint requests, such as a CSRF token. */
  billingHeaders?: () => HeadersInit | Promise<HeadersInit>;
  /**
   * Your app's TanStack Query client, to share its cache and devtools. Without it the provider
   * makes its own. The hooks pass their client explicitly, so they never use or replace a
   * `QueryClientProvider` of your app.
   */
  queryClient?: QueryClient;
  /**
   * Look of every component inside: a predefined theme from `@nozle-js/react/themes`, your own
   * variables, and per-element class names or styles. A component's own `appearance` goes on top.
   */
  appearance?: Appearance;
  /**
   * Apply the theme, colours and pricing table options saved in the Nozle dashboard (Developers >
   * Customize SDK). They are the lowest layer: `appearance` here and on a component win. The
   * provider reads them from the plan catalog request that `PricingTable` shares. Pass `false` to
   * never fetch or apply them. Default true.
   */
  savedAppearance?: boolean;
  children: ReactNode;
}

export function BillingProvider({
  publishableKey,
  createCheckout,
  verifyCheckout,
  getCheckoutStatus,
  createManagePaymentMethod,
  baseUrl = "https://api.nozle.app/engine",
  billingEndpoint,
  billingHeaders,
  queryClient,
  appearance,
  savedAppearance = true,
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
  const [ownQueryClient] = useState(createQueryClient);
  const activeQueryClient = queryClient ?? ownQueryClient;
  const billingFetch = useMemo(
    () => (billingEndpoint ? createBillingFetch(billingEndpoint, billingHeaders) : undefined),
    [billingEndpoint, billingHeaders],
  );
  const contextValue = useMemo(
    () => ({
      client,
      createCheckout,
      verifyCheckout,
      getCheckoutStatus,
      createManagePaymentMethod,
      queryClient: activeQueryClient,
      billingFetch,
      billingEndpoint,
    }),
    [client, createCheckout, verifyCheckout, getCheckoutStatus, createManagePaymentMethod, activeQueryClient, billingFetch, billingEndpoint],
  );

  // Same cache entry as PricingTable and usePlans, so one request. A failure leaves it unset.
  const catalog = useQuery(
    { ...catalogQuery(client), enabled: savedAppearance },
    activeQueryClient,
  );
  const saved = savedAppearance ? catalog.data?.saved : undefined;

  return React.createElement(
    BillingContext.Provider,
    { value: contextValue },
    React.createElement(AppearanceProvider, {
      saved: saved?.appearance,
      savedPricingTable: saved?.pricingTable,
      savedComponents: saved?.components,
      appearance,
      children,
    }),
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
