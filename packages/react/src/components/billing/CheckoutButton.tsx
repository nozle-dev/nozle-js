'use client';

import React, { useState } from 'react';
import {
  useBillingContext,
  type CheckoutResult,
  type CompletedCheckoutResult,
  type ScheduledCheckoutResult,
} from '../../provider.js';

export interface CheckoutButtonProps {
  planCode: string;
  returnUrl?: string;
  label?: string;
  className?: string;
  style?: React.CSSProperties;
  onError?: (error: Error) => void;
  razorpayKeyId?: string;
  onStripeClientSecret?: (clientSecret: string) => void;
  onSuccess?: (paymentId: string) => void;
  onComplete?: (result: CompletedCheckoutResult) => void;
  onScheduled?: (result: ScheduledCheckoutResult) => void;
}

interface RazorpayOptions {
  key: string;
  order_id: string;
  handler: (response: { razorpay_payment_id: string }) => void;
  modal?: { ondismiss?: () => void };
}

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => { open(): void };
  }
}

function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById('razorpay-js')) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.id = 'razorpay-js';
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Razorpay.js'));
    document.body.appendChild(script);
  });
}

export async function handleCheckoutResult(
  result: CheckoutResult,
  options: Pick<
    CheckoutButtonProps,
    | 'razorpayKeyId'
    | 'onStripeClientSecret'
    | 'onSuccess'
    | 'onComplete'
    | 'onScheduled'
  >,
): Promise<void> {
  if ('type' in result && result.type === 'scheduled') {
    options.onScheduled?.(result);
    return;
  }
  if ('type' in result && result.type === 'completed') {
    options.onComplete?.(result);
    return;
  }
  if ('type' in result && result.type === 'razorpay') {
    if (!options.razorpayKeyId) throw new Error('razorpayKeyId is required for Razorpay checkout');
    await loadRazorpayScript();
    const checkout = new window.Razorpay({
      key: options.razorpayKeyId,
      order_id: result.orderId,
      handler: (response) => options.onSuccess?.(response.razorpay_payment_id),
    });
    checkout.open();
    return;
  }
  if ('url' in result && result.url) {
    window.location.assign(result.url);
    return;
  }
  if ('type' in result && result.type === 'stripe') {
    const clientSecret = result.clientSecret ?? result.client_secret;
    if (clientSecret && options.onStripeClientSecret) {
      options.onStripeClientSecret(clientSecret);
      return;
    }
    if (clientSecret) throw new Error('onStripeClientSecret is required for embedded Stripe checkout');
    throw new Error('Stripe checkout did not include a URL or client secret');
  }
  throw new Error('Unknown checkout response format');
}

export function CheckoutButton({
  planCode,
  returnUrl,
  label = 'Get Started',
  className,
  style,
  onError,
  razorpayKeyId,
  onStripeClientSecret,
  onSuccess,
  onComplete,
  onScheduled,
}: CheckoutButtonProps): React.ReactElement {
  const { createCheckout } = useBillingContext();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function handleClick(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      if (!createCheckout) {
        throw new Error('BillingProvider createCheckout callback is required for checkout');
      }
      const result = await createCheckout({
        planCode,
        returnUrl: returnUrl ?? window.location.href,
      });
      await handleCheckoutResult(result, {
        razorpayKeyId,
        onStripeClientSecret,
        onSuccess,
        onComplete,
        onScheduled,
      });
    } catch (cause) {
      const checkoutError = cause instanceof Error ? cause : new Error('Checkout failed');
      setError(checkoutError);
      onError?.(checkoutError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={loading}
        className={className}
        style={{
          padding: '0.75rem 1.5rem',
          borderRadius: 'var(--nozle-radius, 0.5rem)',
          border: 'none',
          background: 'var(--nozle-primary, var(--primary))',
          color: 'var(--nozle-primary-foreground, var(--primary-foreground))',
          cursor: loading ? 'not-allowed' : 'pointer',
          fontWeight: 500,
          opacity: loading ? 0.7 : 1,
          ...style,
        }}
        aria-busy={loading}
      >
        {loading ? 'Loading...' : label}
      </button>
      {error && <span role="alert">{error.message}</span>}
    </>
  );
}
