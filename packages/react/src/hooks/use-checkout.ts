import { useCallback, useState } from "react";
import { useBillingContext } from '../provider.js';
import type { CheckoutResult } from "../types";

export interface UseCheckoutResult {
  fetchClientSecret: (planCode: string, successUrl?: string) => Promise<string>;
  checkout: CheckoutResult | null;
  stripePromise: ReturnType<typeof import("@stripe/stripe-js").loadStripe> | null;
  isLoading: boolean;
  error: Error | null;
}

export function useCheckout(): UseCheckoutResult {
  const { store, stripePromise } = useBillingContext();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [checkout, setCheckout] = useState<CheckoutResult | null>(null);

  const fetchClientSecret = useCallback(
    async (planCode: string, successUrl?: string): Promise<string> => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await store.fetchCheckoutSecret(planCode, successUrl);
        setCheckout(result);
        return result.client_secret;
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

  return { fetchClientSecret, checkout, stripePromise, isLoading, error };
}
