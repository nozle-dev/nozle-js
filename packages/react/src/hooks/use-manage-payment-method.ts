import { useCallback, useState } from 'react';
import { navigateToCheckout } from '../components/billing/checkout-navigation.js';
import {
  openRazorpayCheckout,
  type RazorpayActions,
} from '../components/billing/razorpay-checkout.js';
import { useBillingContext } from '../provider.js';

export interface UseManagePaymentMethodResult {
  /** Stripe: redirects to the billing page. Razorpay: opens Razorpay Checkout. */
  managePaymentMethod: (
    returnUrl?: string,
    actions?: Pick<RazorpayActions, 'onSuccess' | 'onProcessing' | 'onDismiss'>,
  ) => Promise<void>;
  isLoading: boolean;
  error: Error | null;
}

export function useManagePaymentMethod(): UseManagePaymentMethodResult {
  const { createManagePaymentMethod, verifyCheckout, getCheckoutStatus } = useBillingContext();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const managePaymentMethod = useCallback<UseManagePaymentMethodResult['managePaymentMethod']>(
    async (returnUrl, actions) => {
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
        if (result.url) {
          navigateToCheckout(result.url);
        } else if (result.checkout) {
          await openRazorpayCheckout(result.checkout, {
            ...actions,
            verifyCheckout,
            getCheckoutStatus,
          });
        } else {
          throw new Error('Manage payment method response did not include a URL or checkout');
        }
      } catch (cause) {
        const failure = cause instanceof Error ? cause : new Error(String(cause));
        setError(failure);
        throw failure;
      } finally {
        setIsLoading(false);
      }
    },
    [createManagePaymentMethod, verifyCheckout, getCheckoutStatus],
  );

  return { managePaymentMethod, isLoading, error };
}
