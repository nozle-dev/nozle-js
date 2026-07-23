'use client';

import React, { createContext, useContext, useMemo, type ReactNode } from 'react';

export interface CanResult {
  allowed: boolean;
  remaining: number | null;
  limit: number | null;
  used: number;
  error?: string | null;
}

export interface NozleClient {
  authToken: string;
  publishableKey: string | null;
  customerSessionToken: string | null;
  /** @deprecated Browser customer operations must use customerSessionToken. */
  apiKey: string;
  baseUrl: string;
  catalogFetch(path: string, init?: RequestInit): Promise<Response>;
  customerFetch(path: string, init?: RequestInit): Promise<Response>;
  /** @deprecated Alias for customerFetch; it never falls back to a publishable key. */
  fetch(path: string, init?: RequestInit): Promise<Response>;
  creditFetch(path: string, init?: RequestInit): Promise<Response>;
  can(customerId: string, feature: string, metadata?: Record<string, string>): Promise<CanResult>;
}

function createClient(
  publishableKey: string | undefined,
  baseUrl: string,
  customerSessionToken?: string,
): NozleClient {
  const base = baseUrl.replace(/\/+$/, '');
  const authToken = publishableKey ?? customerSessionToken;
  if (!authToken) {
    throw new Error('BillingProvider requires publishableKey or customerSessionToken');
  }

  async function authenticatedFetch(
    token: string,
    path: string,
    init?: RequestInit,
  ): Promise<Response> {
    return fetch(`${base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    });
  }

  const catalogFetch = (path: string, init?: RequestInit) => {
    if (!publishableKey) {
      return Promise.reject(
        new Error('The public plan catalog requires a publishable key'),
      );
    }
    return authenticatedFetch(publishableKey, path, init);
  };
  const customerFetch = (path: string, init?: RequestInit) => {
    if (!customerSessionToken) {
      return Promise.reject(
        new Error('This customer operation requires a scoped customer session token'),
      );
    }
    return authenticatedFetch(customerSessionToken, path, init);
  };

  return {
    authToken,
    publishableKey: publishableKey ?? null,
    customerSessionToken: customerSessionToken ?? null,
    apiKey: customerSessionToken ?? '',
    baseUrl: base,
    catalogFetch,
    customerFetch,
    fetch: customerFetch,
    creditFetch: customerFetch,
    async can(customerId: string, feature: string, metadata?: Record<string, string>): Promise<CanResult> {
      let url = `/api/v1/can?customer_id=${encodeURIComponent(customerId)}&feature=${encodeURIComponent(feature)}`;
      if (metadata) {
        url += `&metadata=${encodeURIComponent(JSON.stringify(metadata))}`;
      }
      const res = await customerFetch(url);
      if (!res.ok) return { allowed: false, remaining: null, limit: null, used: 0 };
      return res.json();
    },
  };
}

export interface BillingContextValue {
  client: NozleClient | null;
  customerId: string;
  workspaceId: string;
  centrifugoUrl: string;
  centrifugoToken: string | null;
}

export const BillingContext = createContext<BillingContextValue | null>(null);

export interface BillingProviderProps {
  customerSessionToken?: string;
  apiKey?: string;
  publishableKey?: string;
  customerId?: string;
  baseUrl?: string;
  workspaceId?: string;
  centrifugoUrl?: string;
  children: ReactNode;
}

export function BillingProvider({
  customerSessionToken,
  apiKey,
  publishableKey,
  customerId = '',
  baseUrl = 'https://api.nozle.app',
  workspaceId = '',
  centrifugoUrl,
  children,
}: BillingProviderProps): React.ReactElement {
  const legacySessionToken = apiKey?.startsWith('csess_') ? apiKey : undefined;
  const legacyPublishableKey = apiKey && !legacySessionToken ? apiKey : undefined;
  const resolvedSessionToken = customerSessionToken ?? legacySessionToken;
  const resolvedPublishableKey = publishableKey ?? legacyPublishableKey;
  if (resolvedPublishableKey && !resolvedPublishableKey.startsWith('pk_')) {
    throw new Error('BillingProvider publishableKey must be a publishable key (pk_)');
  }
  if (resolvedSessionToken && !resolvedSessionToken.startsWith('csess_')) {
    throw new Error('BillingProvider customerSessionToken must be a customer session (csess_)');
  }
  if (!resolvedPublishableKey && !resolvedSessionToken) {
    throw new Error('BillingProvider requires publishableKey or customerSessionToken');
  }

  const client = useMemo(
    () => createClient(resolvedPublishableKey, baseUrl, resolvedSessionToken),
    [resolvedPublishableKey, baseUrl, resolvedSessionToken],
  );

  const resolvedCentrifugoUrl =
    centrifugoUrl ??
    (typeof process !== 'undefined' ? (process.env['NEXT_PUBLIC_CENTRIFUGO_URL'] ?? '') : '');

  const contextValue: BillingContextValue = {
    client,
    customerId,
    workspaceId,
    centrifugoUrl: resolvedCentrifugoUrl,
    centrifugoToken: null,
  };

  return React.createElement(BillingContext.Provider, { value: contextValue }, children);
}

export function useBillingContext(): BillingContextValue {
  const context = useContext(BillingContext);
  if (!context) {
    throw new Error('useBillingContext must be used within a BillingProvider');
  }
  return context;
}

export function useNozleClient(): NozleClient {
  const { client } = useBillingContext();
  if (!client) throw new Error('useNozleClient must be used within <BillingProvider>');
  return client;
}
