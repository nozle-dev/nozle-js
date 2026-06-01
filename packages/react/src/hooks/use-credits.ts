/**
 * useCredits hook — fetch credit balance for a customer.
 * Calls GET /api/v1/credits/:customerId/balance via client's fetch wrapper.
 */

import { useState, useEffect } from "react";
import { useBillingContext } from '../provider.js';

export interface CreditsState {
  balance: number | null;
  loading: boolean;
  error: string | null;
}

interface CreditsResponse {
  balance?: number;
  amount?: number;
}

/**
 * Fetch credit balance for a customer.
 *
 * @param customerId - Customer ID to fetch credit balance for
 * @returns CreditsState with balance, loading, error
 */
export function useCredits(customerId: string): CreditsState {
  const { client } = useBillingContext();
  const [state, setState] = useState<CreditsState>({
    balance: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!client) {
      setState({
        balance: null,
        loading: false,
        error: "No client in context",
      });
      return;
    }

    let cancelled = false;

    async function fetchCredits(): Promise<void> {
      try {
        const clientInternal = client as unknown as {
          apiKey?: string;
          baseUrl?: string;
          timeout?: number;
        };
        const apiKey = clientInternal.apiKey ?? "";
        const baseUrl = clientInternal.baseUrl ?? "https://api.nozle.io";
        const timeout = clientInternal.timeout ?? 5000;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(
          `${baseUrl}/api/v1/credits/${customerId}/balance`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
            signal: controller.signal,
          },
        );

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = (await response.json()) as CreditsResponse;
        if (!cancelled) {
          setState({
            balance: data.balance ?? data.amount ?? null,
            loading: false,
            error: null,
          });
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Unknown error";
          setState({ balance: null, loading: false, error: message });
        }
      }
    }

    void fetchCredits();

    return () => {
      cancelled = true;
    };
  }, [client, customerId]);

  return state;
}
