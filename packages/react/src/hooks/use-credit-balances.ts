"use client";

import { useCallback, useEffect, useState } from "react";

import { useBillingContext } from "../provider.js";
import type { CreditBalancesResponse } from "../types.js";

export interface CreditBalancesState {
  data: CreditBalancesResponse | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useCreditBalances(
  customerIdOverride?: string,
): CreditBalancesState {
  const { client, customerId: contextCustomerId } = useBillingContext();
  const customerId = customerIdOverride ?? contextCustomerId;
  const [data, setData] = useState<CreditBalancesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);
  const refetch = useCallback(
    () => setRequestVersion((version) => version + 1),
    [],
  );

  useEffect(() => {
    if (!client || !customerId.trim()) {
      setData(null);
      setIsLoading(false);
      setError(new Error("customerId is required"));
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    setError(null);
    void client
      .creditFetch(
        `/api/v1/customers/${encodeURIComponent(customerId)}/credit-systems`,
        {
          signal: controller.signal,
        },
      )
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            `credit balances request failed with HTTP ${response.status}`,
          );
        const result = (await response.json()) as CreditBalancesResponse;
        if (!controller.signal.aborted) setData(result);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setData(null);
          setError(
            reason instanceof Error ? reason : new Error(String(reason)),
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [client, customerId, requestVersion]);

  return { data, isLoading, error, refetch };
}
