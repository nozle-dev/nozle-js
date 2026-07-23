import { useEffect, useState } from "react";
import { useBillingContext } from '../provider.js';
import type { UsePlanResult } from "../types";

export function usePlan(): UsePlanResult {
  const { client, customerId } = useBillingContext();
  const [state, setState] = useState<UsePlanResult>({
    data: null,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    if (!client || !customerId) {
      setState({
        data: null,
        isLoading: false,
        error: new Error("BillingProvider customerId is required"),
      });
      return;
    }

    void client
      .customerFetch(
        `/api/v1/subscriptions/current?customer_id=${encodeURIComponent(customerId)}`,
      )
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as {
          plan?: string;
          plan_slug?: string;
          status?: string;
          subscription_status?: string;
        };
        if (!cancelled) {
          setState({
            data: {
              plan_slug: data.plan_slug ?? data.plan ?? "",
              subscription_status:
                data.subscription_status ?? data.status ?? "unknown",
            },
            isLoading: false,
            error: null,
          });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            data: null,
            isLoading: false,
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [client, customerId]);

  return state;
}
