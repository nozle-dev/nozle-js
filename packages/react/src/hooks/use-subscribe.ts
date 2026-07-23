import { useCallback, useState } from "react";
import { useBillingContext } from "../provider.js";

export interface UseSubscribeResult {
  subscribe: (planCode: string) => Promise<any>;
  isLoading: boolean;
  error: Error | null;
}

/** @deprecated Browser plan changes must use checkout. This compatibility hook now starts checkout. */
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
        // Browser subscription changes must enter the payment-aware checkout
        // flow. The direct /subscribe endpoint is reserved for trusted backends.
        const res = await client.customerFetch(`/api/v1/checkout`, {
          method: "POST",
          body: JSON.stringify({
            plan_code: planCode,
            customer_id: customerId,
          }),
        });
        if (!res.ok) throw new Error("Failed to create subscription checkout");
        return await res.json();
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        throw e;
      } finally {
        setIsLoading(false);
      }
    },
    [client, customerId],
  );

  return { subscribe, isLoading, error };
}
