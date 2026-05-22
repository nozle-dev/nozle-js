import { useCallback, useState } from "react";
import { useBillingContext } from "../provider";

export interface UseCheckoutResult {
  fetchClientSecret: (planCode: string, successUrl?: string) => Promise<string>;
  stripePromise: ReturnType<typeof import("@stripe/stripe-js").loadStripe> | null;
  isLoading: boolean;
  error: Error | null;
}

export function useCheckout(): UseCheckoutResult {
  const { store, stripePromise } = useBillingContext();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchClientSecret = useCallback(
    async (planCode: string, successUrl?: string): Promise<string> => {
      setIsLoading(true);
      setError(null);
      try {
        return await store.fetchCheckoutSecret(planCode, successUrl);
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

  return { fetchClientSecret, stripePromise, isLoading, error };
}
