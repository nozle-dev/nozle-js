import { useCallback, useState } from "react";
import { useBillingContext } from "../provider.js";
import type { CheckoutResult } from "../types";

export interface UseCheckoutResult {
  fetchClientSecret: (
    planCode: string,
    successUrl?: string,
  ) => Promise<string | null>;
  checkout: CheckoutResult | null;
  stripePromise: ReturnType<
    typeof import("@stripe/stripe-js").loadStripe
  > | null;
  isLoading: boolean;
  error: Error | null;
}

export function useCheckout(): UseCheckoutResult {
  const { client, customerId } = useBillingContext();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [checkout, setCheckout] = useState<CheckoutResult | null>(null);

  const fetchClientSecret = useCallback(
    async (planCode: string, successUrl?: string): Promise<string | null> => {
      setIsLoading(true);
      setError(null);
      try {
        if (!client || !customerId) {
          throw new Error("BillingProvider customerId is required");
        }
        const response = await client.customerFetch("/api/v1/checkout", {
          method: "POST",
          body: JSON.stringify({
            plan_code: planCode,
            customer_id: customerId,
            success_url: successUrl,
          }),
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: Checkout failed`);
        }
        const result = (await response.json()) as CheckoutResult;
        setCheckout(result);
        const clientSecret = result.client_secret ?? result.clientSecret;
        if (clientSecret) return clientSecret;
        if (result.type === "completed" || result.type === "scheduled")
          return null;

        throw new Error(
          "Checkout response did not include a supported result type",
        );
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

  return { fetchClientSecret, checkout, stripePromise: null, isLoading, error };
}
