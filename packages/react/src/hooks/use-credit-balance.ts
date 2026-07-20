"use client";

import { useCallback, useEffect, useState } from "react";

import { useBillingContext } from "../provider.js";
import type { CreditBalanceData } from "../types.js";

export interface UseCreditBalanceOptions {
  customerId?: string;
  enabled?: boolean;
}

export interface CreditBalanceState {
  data: CreditBalanceData | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useCreditBalance(
  creditSystemCode: string,
  options: UseCreditBalanceOptions = {},
): CreditBalanceState {
  const { client, customerId: contextCustomerId } = useBillingContext();
  const customerId = options.customerId ?? contextCustomerId;
  const enabled = options.enabled ?? true;
  const [data, setData] = useState<CreditBalanceData | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<Error | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);
  const refetch = useCallback(
    () => setRequestVersion((version) => version + 1),
    [],
  );

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }
    if (!client || !customerId.trim() || !creditSystemCode.trim()) {
      setData(null);
      setIsLoading(false);
      setError(new Error("customerId and creditSystemCode are required"));
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    setError(null);
    void client
      .creditFetch(
        `/api/v1/customers/${encodeURIComponent(customerId)}/credit-systems/${encodeURIComponent(creditSystemCode)}/balance`,
        { signal: controller.signal },
      )
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            `credit balance request failed with HTTP ${response.status}`,
          );
        const result = (await response.json()) as CreditBalanceData;
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
  }, [client, creditSystemCode, customerId, enabled, requestVersion]);

  return { data, isLoading, error, refetch };
}
