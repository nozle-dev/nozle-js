import { useCallback, useState } from 'react';
import { navigateToCheckout } from '../components/billing/checkout-navigation.js';
import { useBillingContext, type CheckoutResult } from '../provider.js';

export interface UseCheckoutResult {
  fetchClientSecret: (planCode: string, returnUrl?: string) => Promise<string | null>;
  checkout: CheckoutResult | null;
  isLoading: boolean;
  error: Error | null;
}

export function useCheckout(): UseCheckoutResult {
  const { createCheckout } = useBillingContext();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [checkout, setCheckout] = useState<CheckoutResult | null>(null);

  const fetchClientSecret = useCallback(
    async (planCode: string, returnUrl?: string): Promise<string | null> => {
      setIsLoading(true);
      setError(null);
      try {
        if (!createCheckout) {
          throw new Error('BillingProvider createCheckout callback is required for checkout');
        }
        const result = await createCheckout({
          planCode,
          returnUrl: returnUrl ?? window.location.href,
        });
        setCheckout(result);

        if ('client_secret' in result || 'clientSecret' in result) {
          const clientSecret = result.client_secret ?? result.clientSecret;
          if (clientSecret) return clientSecret;
        }
        if ('url' in result && result.url) {
          navigateToCheckout(result.url);
          return null;
        }
        if ('type' in result && (result.type === 'completed' || result.type === 'scheduled')) {
          return null;
        }
        throw new Error('Checkout response did not include a supported result type');
      } catch (cause) {
        const checkoutError = cause instanceof Error ? cause : new Error(String(cause));
        setError(checkoutError);
        throw checkoutError;
      } finally {
        setIsLoading(false);
      }
    },
    [createCheckout],
  );

  return { fetchClientSecret, checkout, isLoading, error };
}
