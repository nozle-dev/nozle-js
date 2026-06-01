/**
 * BillingProvider — React context provider for the Nozle SDK.
 * SDK-03: Provides NozleClient instance + Centrifugo credentials to all child hooks.
 *
 * No prop drilling: all useCan/useUsage/useCredits hooks read from context.
 */

import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { NozleClient } from '@nozle/sdk';

export interface BillingContextValue {
  client: NozleClient | null;
  workspaceId: string;
  centrifugoUrl: string;
  centrifugoToken: string | null;
}

export const BillingContext = createContext<BillingContextValue>({
  client: null,
  workspaceId: '',
  centrifugoUrl: '',
  centrifugoToken: null,
});

export interface BillingProviderProps {
  client: NozleClient;
  workspaceId: string;
  /**
   * Centrifugo WebSocket URL.
   * Defaults to process.env.NEXT_PUBLIC_CENTRIFUGO_URL if not provided.
   */
  centrifugoUrl?: string;
  children: ReactNode;
}

interface CentrifugoTokenResponse {
  token: string;
  workspaceId: string;
}

/**
 * BillingProvider wraps your application and provides the NozleClient and
 * Centrifugo connection details to all child Nozle hooks.
 *
 * Usage:
 * ```tsx
 * <BillingProvider client={client} workspaceId="ws_xxx">
 *   <App />
 * </BillingProvider>
 * ```
 */
export function BillingProvider({
  client,
  workspaceId,
  centrifugoUrl,
  children,
}: BillingProviderProps): React.ReactElement {
  const [centrifugoToken, setCentrifugoToken] = useState<string | null>(null);

  const resolvedCentrifugoUrl =
    centrifugoUrl ??
    (typeof process !== 'undefined' ? (process.env['NEXT_PUBLIC_CENTRIFUGO_URL'] ?? '') : '');

  useEffect(() => {
    let cancelled = false;

    // SDK-03: Fetch API-key-based centrifugo token from BFF
    async function fetchCentrifugoToken(): Promise<void> {
      try {
        // Access the internal apiKey via the client options — use a cast for now
        const clientInternal = client as unknown as {
          apiKey?: string;
          baseUrl?: string;
        };
        const apiKey = clientInternal.apiKey ?? '';
        const baseUrl = clientInternal.baseUrl ?? 'https://api.nozle.io';

        const response = await fetch(`${baseUrl}/api/v1/auth/centrifugo-token`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        });

        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as CentrifugoTokenResponse;
        if (!cancelled && data.token) {
          setCentrifugoToken(data.token);
        }
      } catch {
        // Best-effort: if token fetch fails, hooks fall back to polling-free degraded mode
      }
    }

    void fetchCentrifugoToken();

    return () => {
      cancelled = true;
    };
  }, [client]);

  const contextValue: BillingContextValue = {
    client,
    workspaceId,
    centrifugoUrl: resolvedCentrifugoUrl,
    centrifugoToken,
  };

  return React.createElement(BillingContext.Provider, { value: contextValue }, children);
}

/**
 * Internal hook for accessing the BillingContext.
 * Used by useCan, useUsage, useCredits.
 */
export function useBillingContext(): BillingContextValue {
  return useContext(BillingContext);
}
