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
  credits_balance?: string | number;
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
    const currentClient = client;

    let cancelled = false;

    async function fetchCredits(): Promise<void> {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await currentClient.customerFetch(
          `/api/v1/credits/${encodeURIComponent(customerId)}/balance`,
          { method: "GET", signal: controller.signal },
        );

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = (await response.json()) as CreditsResponse;
        if (!cancelled) {
          setState({
            balance:
              data.credits_balance !== undefined
                ? Number(data.credits_balance)
                : (data.balance ?? data.amount ?? null),
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
