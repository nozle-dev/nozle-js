import { useCallback, useState } from 'react';
import { navigateToCheckout } from '../components/billing/checkout-navigation.js';
import { useBillingContext, type CheckoutResult } from '../provider.js';

export interface UseCheckoutResult {
  /**
   * Creates the checkout. A hosted result (Stripe Checkout or a Razorpay link) redirects the page to its
   * `url`; completed, scheduled, Razorpay and processing results come back in `checkout` for you to handle.
   */
  startCheckout: (planCode: string, returnUrl?: string) => Promise<void>;
  checkout: CheckoutResult | null;
  isLoading: boolean;
  error: Error | null;
}

export function useCheckout(): UseCheckoutResult {
  const { createCheckout } = useBillingContext();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [checkout, setCheckout] = useState<CheckoutResult | null>(null);

  const startCheckout = useCallback(
    async (planCode: string, returnUrl?: string): Promise<void> => {
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

        if ('url' in result && result.url) {
          navigateToCheckout(result.url);
          return;
        }
        if ('type' in result && ['completed', 'scheduled', 'razorpay', 'processing'].includes(result.type)) {
          return;
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

  return { startCheckout, checkout, isLoading, error };
}
