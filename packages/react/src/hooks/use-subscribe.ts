import { useCallback, useState } from "react";
import { useBillingContext } from "../provider";

export interface UseSubscribeResult {
  subscribe: (planCode: string) => Promise<any>;
  isLoading: boolean;
  error: Error | null;
}

export function useSubscribe(): UseSubscribeResult {
  const { store } = useBillingContext();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const subscribe = useCallback(
    async (planCode: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`${store.baseUrl}/v1/subscribe`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${store.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            plan_code: planCode,
            customer_id: store.customerId,
          }),
        });
        if (!res.ok) throw new Error("Failed to create subscription");
        return await res.json();
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        throw e;
      } finally {
        setIsLoading(false);
      }
    },
    [store]
  );

  return { subscribe, isLoading, error };
}
