import { useCallback, useState } from 'react';
import { navigateToCheckout } from '../components/billing/checkout-navigation.js';
import { useOptionalBillingContext } from '../provider.js';

export interface UseManagePaymentMethodResult {
  /**
   * Redirects to the Stripe billing page. For a Razorpay customer your backend's call fails with
   * `razorpay_pays_by_link` (they pay each invoice by payment link); that error is set and rethrown.
   */
  managePaymentMethod: (returnUrl?: string) => Promise<void>;
  isLoading: boolean;
  error: Error | null;
}

export function useManagePaymentMethod(): UseManagePaymentMethodResult {
  // Optional context: outside a BillingProvider the call fails with the error below instead of the render.
  const createManagePaymentMethod = useOptionalBillingContext()?.createManagePaymentMethod;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const managePaymentMethod = useCallback<UseManagePaymentMethodResult['managePaymentMethod']>(
    async (returnUrl) => {
      setIsLoading(true);
      setError(null);
      try {
        if (!createManagePaymentMethod) {
          throw new Error(
            'BillingProvider createManagePaymentMethod callback is required to manage a payment method',
          );
        }
        const result = await createManagePaymentMethod({
          returnUrl: returnUrl ?? window.location.href,
        });
        if (!result.url) throw new Error('Manage payment method response did not include a URL');
        navigateToCheckout(result.url);
      } catch (cause) {
        const failure = cause instanceof Error ? cause : new Error(String(cause));
        setError(failure);
        throw failure;
      } finally {
        setIsLoading(false);
      }
    },
    [createManagePaymentMethod],
  );

  return { managePaymentMethod, isLoading, error };
}
