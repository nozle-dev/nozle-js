'use client';

import React, { createContext, useContext, useEffect, useState, useMemo, type ReactNode } from 'react';

export interface CanResult {
  allowed: boolean;
  remaining: number | null;
  limit: number | null;
  used: number;
  error?: string | null;
}

export interface NozleClient {
  apiKey: string;
  baseUrl: string;
  fetch(path: string, init?: RequestInit): Promise<Response>;
  can(customerId: string, feature: string, metadata?: Record<string, string>): Promise<CanResult>;
}

function createClient(apiKey: string, baseUrl: string): NozleClient {
  const base = baseUrl.replace(/\/+$/, '');

  async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
    return fetch(`${base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    });
  }

  return {
    apiKey,
    baseUrl: base,
    fetch: apiFetch,
    async can(customerId: string, feature: string, metadata?: Record<string, string>): Promise<CanResult> {
      let url = `/api/v1/can?customer_id=${encodeURIComponent(customerId)}&feature=${encodeURIComponent(feature)}`;
      if (metadata) {
        url += `&metadata=${encodeURIComponent(JSON.stringify(metadata))}`;
      }
      const res = await apiFetch(url);
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
  apiKey?: string;
  publishableKey?: string;
  customerId?: string;
  baseUrl?: string;
  workspaceId?: string;
  centrifugoUrl?: string;
  children: ReactNode;
}

export function BillingProvider({
  apiKey,
  publishableKey,
  customerId = '',
  baseUrl = 'https://api.nozle.app',
  workspaceId = '',
  centrifugoUrl,
  children,
}: BillingProviderProps): React.ReactElement {
  const resolvedApiKey = apiKey ?? publishableKey;
  if (!resolvedApiKey) {
    throw new Error('BillingProvider requires apiKey or publishableKey');
  }

  const client = useMemo(
    () => createClient(resolvedApiKey, baseUrl),
    [resolvedApiKey, baseUrl],
  );
  const [centrifugoToken, setCentrifugoToken] = useState<string | null>(null);

  const resolvedCentrifugoUrl =
    centrifugoUrl ??
    (typeof process !== 'undefined' ? (process.env['NEXT_PUBLIC_CENTRIFUGO_URL'] ?? '') : '');

  useEffect(() => {
    let cancelled = false;

    async function fetchCentrifugoToken(): Promise<void> {
      try {
        const response = await client.fetch('/api/v1/auth/centrifugo-token');
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled && data.token) {
          setCentrifugoToken(data.token);
        }
      } catch {
        // Best-effort: centrifugo is optional for real-time updates
      }
    }

    void fetchCentrifugoToken();
    return () => { cancelled = true; };
  }, [client]);

  const contextValue: BillingContextValue = {
    client,
    customerId,
    workspaceId,
    centrifugoUrl: resolvedCentrifugoUrl,
    centrifugoToken,
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
