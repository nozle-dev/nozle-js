'use client';

import React, { createContext, useContext, useMemo, type ReactNode } from 'react';

export interface CompletedCheckoutResult {
  type: 'completed';
  status: string;
  payment_source?: string;
  subscription_id?: string;
  plan_code?: string;
  invoice_id?: string;
  amount_cents?: number;
  currency?: string;
}

export interface ScheduledCheckoutResult {
  type: 'scheduled';
  status: string;
  subscription_id?: string;
  plan_code?: string;
}

export type CheckoutResult =
  | {
      type: 'stripe';
      url?: string;
      clientSecret?: string;
      client_secret?: string;
    }
  | { type: 'razorpay'; orderId: string }
  | CompletedCheckoutResult
  | ScheduledCheckoutResult
  | { url: string };

export interface CreateCheckoutInput {
  planCode: string;
  returnUrl: string;
}

export type CreateCheckout = (input: CreateCheckoutInput) => Promise<CheckoutResult>;

export interface NozleClient {
  publishableKey: string;
  baseUrl: string;
  catalogFetch(path: string, init?: RequestInit): Promise<Response>;
}

function createClient(publishableKey: string, baseUrl: string): NozleClient {
  const base = baseUrl.replace(/\/+$/, '');

  return {
    publishableKey,
    baseUrl: base,
    catalogFetch(path: string, init?: RequestInit): Promise<Response> {
      return fetch(`${base}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${publishableKey}`,
          'Content-Type': 'application/json',
          ...init?.headers,
        },
      });
    },
  };
}

export interface BillingContextValue {
  client: NozleClient;
  createCheckout?: CreateCheckout;
}

export const BillingContext = createContext<BillingContextValue | null>(null);

export interface BillingProviderProps {
  publishableKey: string;
  createCheckout?: CreateCheckout;
  baseUrl?: string;
  children: ReactNode;
}

export function BillingProvider({
  publishableKey,
  createCheckout,
  baseUrl = 'https://api.nozle.app',
  children,
}: BillingProviderProps): React.ReactElement {
  if (!publishableKey.startsWith('pk_')) {
    throw new Error('BillingProvider publishableKey must be a publishable key (pk_)');
  }

  const client = useMemo(
    () => createClient(publishableKey, baseUrl),
    [publishableKey, baseUrl],
  );
  const contextValue = useMemo(
    () => ({ client, createCheckout }),
    [client, createCheckout],
  );

  return React.createElement(BillingContext.Provider, { value: contextValue }, children);
}

export function useOptionalBillingContext(): BillingContextValue | null {
  return useContext(BillingContext);
}

export function useBillingContext(): BillingContextValue {
  const context = useOptionalBillingContext();
  if (!context) {
    throw new Error('useBillingContext must be used within a BillingProvider');
  }
  return context;
}

export function useNozleClient(): NozleClient {
  return useBillingContext().client;
}
