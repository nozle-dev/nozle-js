import { useCallback, useState } from "react";
import { useBillingContext } from '../provider.js';

export interface UseSubscribeResult {
  subscribe: (planCode: string) => Promise<any>;
  isLoading: boolean;
  error: Error | null;
}

export function useSubscribe(): UseSubscribeResult {
  const { client, customerId } = useBillingContext();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const subscribe = useCallback(
    async (planCode: string) => {
      setIsLoading(true);
      setError(null);
      try {
        if (!client || !customerId) {
          throw new Error("BillingProvider customerId is required");
        }
        const res = await client.fetch(`/api/v1/subscribe`, {
          method: "POST",
          body: JSON.stringify({
            plan_code: planCode,
            customer_id: customerId,
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
    [client, customerId]
  );

  return { subscribe, isLoading, error };
}
