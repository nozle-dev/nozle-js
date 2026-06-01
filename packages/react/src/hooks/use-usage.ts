/**
 * useUsage hook — fetch usage data for a customer metric.
 * Calls GET /api/v1/usage/:customerId/:metricKey via client's fetch wrapper.
 */

import { useState, useEffect } from "react";
import { useBillingContext } from '../provider.js';

export interface UsageState {
  value: number | null;
  loading: boolean;
  error: string | null;
}

interface UsageResponse {
  value?: number;
  total?: number;
}

/**
 * Fetch usage for a customer metric.
 *
 * @param customerId - Customer ID to fetch usage for
 * @param metricKey - Metric key to fetch
 * @returns UsageState with value, loading, error
 */
export function useUsage(customerId: string, metricKey: string): UsageState {
  const { client } = useBillingContext();
  const [state, setState] = useState<UsageState>({
    value: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!client) {
      setState({ value: null, loading: false, error: "No client in context" });
      return;
    }

    let cancelled = false;

    async function fetchUsage(): Promise<void> {
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
          `${baseUrl}/api/v1/usage/${customerId}/${metricKey}`,
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

        const data = (await response.json()) as UsageResponse;
        if (!cancelled) {
          setState({
            value: data.value ?? data.total ?? null,
            loading: false,
            error: null,
          });
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Unknown error";
          setState({ value: null, loading: false, error: message });
        }
      }
    }

    void fetchUsage();

    return () => {
      cancelled = true;
    };
  }, [client, customerId, metricKey]);

  return state;
}
