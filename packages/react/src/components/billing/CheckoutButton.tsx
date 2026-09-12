'use client';

import React, { useRef, useState } from 'react';
import {
  useBillingContext,
  type CheckoutResult,
  type CompletedCheckoutResult,
  type ScheduledCheckoutResult,
} from '../../provider.js';

import {
  openRazorpayCheckout,
  resumeCheckout,
  type RazorpayActions,
} from './razorpay-checkout.js';

export interface CheckoutButtonProps extends Omit<
  RazorpayActions,
  'verifyCheckout' | 'getCheckoutStatus'
> {
  planCode: string;
  returnUrl?: string;
  label?: string;
  className?: string;
  style?: React.CSSProperties;
  onError?: (error: Error) => void;
  /** @deprecated The server supplies the public Razorpay key in the checkout response. */
  razorpayKeyId?: string;
  registerMandate?: boolean;
  onStripeClientSecret?: (clientSecret: string) => void;
  onSuccess?: (paymentId: string) => void;
  onComplete?: (result: CompletedCheckoutResult) => void;
  onScheduled?: (result: ScheduledCheckoutResult) => void;
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
  > &
    RazorpayActions,
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
    await openRazorpayCheckout(result, options);
    return;
  }
  if ('type' in result && result.type === 'processing') {
    const next = await resumeCheckout(result, options);
    if (next) await handleCheckoutResult(next, options);
    return;
  }
  if ('type' in result && result.type === 'hosted') {
    window.location.assign(result.payment_url);
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
    if (clientSecret)
      throw new Error(
        'onStripeClientSecret is required for embedded Stripe checkout',
      );
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
  registerMandate,
  onProcessing,
  onDismiss,
  onStripeClientSecret,
  onSuccess,
  onComplete,
  onScheduled,
}: CheckoutButtonProps): React.ReactElement {
  const { createCheckout, verifyCheckout, getCheckoutStatus } =
    useBillingContext();
  const attempt = useRef<{ plan: string; key: string } | undefined>(undefined);
  const inFlight = useRef(false);
  const [processing, setProcessing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function handleClick(): Promise<void> {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setProcessing(false);
    setError(null);
    try {
      if (!createCheckout) {
        throw new Error(
          'BillingProvider createCheckout callback is required for checkout',
        );
      }
      if (attempt.current?.plan !== planCode)
        attempt.current = { plan: planCode, key: crypto.randomUUID() };
      const result = await createCheckout({
        idempotencyKey: attempt.current.key,
        ...(registerMandate !== undefined && { registerMandate }),
        planCode,
        returnUrl: returnUrl ?? window.location.href,
      });
      await handleCheckoutResult(result, {
        razorpayKeyId,
        verifyCheckout,
        getCheckoutStatus,
        onProcessing: (status) => {
          setProcessing(true);
          onProcessing?.(status);
        },
        onDismiss,
        onStripeClientSecret,
        onSuccess: (id) => {
          setProcessing(false);
          onSuccess?.(id);
        },
        onComplete: (completed) => {
          setProcessing(false);
          onComplete?.(completed);
        },
        onScheduled,
      });
    } catch (cause) {
      const checkoutError =
        cause instanceof Error ? cause : new Error('Checkout failed');
      setError(checkoutError);
      onError?.(checkoutError);
    } finally {
      inFlight.current = false;
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
      {processing && (
        <span role="status">
          Payment is processing. Confirmation may take a little while.
        </span>
      )}
      {error && <span role="alert">{error.message}</span>}
    </>
  );
}
