'use client';

import React, { createContext, useContext, useMemo, useState } from 'react';
import {
  EmbeddedCheckout as StripeEmbeddedCheckout,
  EmbeddedCheckoutProvider,
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import type { Appearance, StripeElementsOptions } from '@stripe/stripe-js';

// ── Public interfaces ────────────────────────────────────────────────────────

export interface CheckoutProps {
  /** Stripe PaymentIntent client secret */
  clientSecret: string;
  /** Stripe publishable key */
  publishableKey: string;
  /** Optional Stripe Connect account ID */
  stripeAccount?: string;
  /** Custom label for the submit button (default: "Pay now") */
  submitLabel?: string;
  /** Called with the paymentIntentId when payment succeeds without redirect */
  onSuccess?: (paymentIntentId: string) => void;
  /** Called when an embedded Checkout Session completes without a redirect. */
  onComplete?: () => void;
  /** Called with the error when payment fails */
  onError?: (error: Error) => void;
  /** Called when the PaymentElement becomes interactive */
  onReady?: () => void;
  /** Additional CSS class for the outer wrapper */
  className?: string;
  /** Inline styles for the outer wrapper */
  style?: React.CSSProperties;
  /** Optional custom controls for the PaymentIntent/PaymentElement branch. */
  children?: React.ReactNode;
}

export interface UseCheckoutResult {
  /** Trigger payment confirmation programmatically */
  confirmPayment: () => Promise<void>;
  /** True while a payment confirmation is in-flight */
  isProcessing: boolean;
  /** Last payment error, or null if no error */
  error: Error | null;
}

// ── Internal context ──────────────────────────────────────────────────────────

interface CheckoutContextValue {
  confirmPayment: () => Promise<void>;
  isProcessing: boolean;
  error: Error | null;
}

const CheckoutContext = createContext<CheckoutContextValue | null>(null);

// ── Public hook ───────────────────────────────────────────────────────────────

export function useCheckout(): UseCheckoutResult {
  const ctx = useContext(CheckoutContext);
  if (ctx === null) {
    throw new Error('useCheckout must be used inside a <Checkout> component');
  }
  return ctx;
}

// ── Stripe appearance builder ─────────────────────────────────────────────────

function buildStripeAppearance(): Appearance {
  if (typeof document === 'undefined') {
    return { theme: 'stripe' };
  }

  const style = getComputedStyle(document.documentElement);
  const get = (prop: string, fallback: string) => style.getPropertyValue(prop).trim() || fallback;

  return {
    theme: 'stripe',
    variables: {
      colorPrimary: get('--nozle-primary', '#16a34a'),
      colorBackground: get('--nozle-background', '#f8fafc'),
      colorText: get('--nozle-foreground', '#1e293b'),
      colorDanger: get('--nozle-destructive', '#dc2626'),
      borderRadius: get('--nozle-radius', '0.5rem'),
      fontFamily: 'inherit',
    },
  };
}

// ── Inner form component ──────────────────────────────────────────────────────

type CheckoutInnerProps = Pick<
  CheckoutProps,
  'submitLabel' | 'onSuccess' | 'onError' | 'onReady' | 'className' | 'style'
> & {children?: React.ReactNode};

function CheckoutInner({
  submitLabel,
  onSuccess,
  onError,
  onReady,
  className,
  style,
  children,
}: CheckoutInnerProps) {
  const stripe = useStripe();
  const elements = useElements();

  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isReady, setIsReady] = useState(false);

  async function confirmPayment(): Promise<void> {
    if (!stripe || !elements) return;

    setIsProcessing(true);
    setError(null);

    const result = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: 'if_required',
    });

    setIsProcessing(false);

    if (result.error) {
      const err = new Error(result.error.message ?? 'Payment failed');
      setError(err);
      onError?.(err);
    } else if (result.paymentIntent?.status === 'succeeded') {
      onSuccess?.(result.paymentIntent.id);
    }
  }

  return (
    <CheckoutContext.Provider value={{ confirmPayment, isProcessing, error }}>
      <div className={className} style={style}>
        <style>{`@keyframes nozle-skeleton-pulse { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>

        {!isReady && (
          <div
            data-testid="checkout-skeleton"
            style={{
              height: '200px',
              borderRadius: 'var(--nozle-radius, 0.5rem)',
              background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
              backgroundSize: '200% 100%',
              animation: 'nozle-skeleton-pulse 1.5s ease-in-out infinite',
            }}
          />
        )}

        <PaymentElement
          onReady={() => {
            setIsReady(true);
            onReady?.();
          }}
        />

        {error !== null && (
          <p style={{ color: 'var(--nozle-destructive, #dc2626)', margin: '0.5rem 0 0' }}>
            {error.message}
          </p>
        )}

        {children ?? (
          <button
            type="button"
            onClick={() => void confirmPayment()}
            disabled={isProcessing || !stripe}
            aria-busy={isProcessing}
            style={{
              padding: '0.75rem 1.5rem',
              borderRadius: 'var(--nozle-radius, 0.5rem)',
              border: 'none',
              background: 'var(--nozle-primary, var(--primary))',
              color: 'var(--nozle-primary-foreground, var(--primary-foreground))',
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              fontWeight: 500,
              opacity: isProcessing ? 0.7 : 1,
              marginTop: '1rem',
              width: '100%',
            }}
          >
            {isProcessing ? 'Processing...' : (submitLabel ?? 'Pay now')}
          </button>
        )}
      </div>
    </CheckoutContext.Provider>
  );
}

// ── Public Checkout component ─────────────────────────────────────────────────

export function Checkout({
  clientSecret,
  publishableKey,
  stripeAccount,
  submitLabel,
  onSuccess,
  onComplete,
  onError,
  onReady,
  className,
  style,
  children,
}: CheckoutProps) {
  const stripePromise = useMemo(
    () => loadStripe(publishableKey, stripeAccount ? { stripeAccount } : undefined),
    [publishableKey, stripeAccount]
  );

  const appearance = useMemo(() => buildStripeAppearance(), []);

  const embeddedOptions = useMemo(
    () => ({clientSecret, onComplete}),
    [clientSecret, onComplete]
  );

  if (clientSecret.startsWith('cs_')) {
    return (
      <div className={className} style={style}>
        <EmbeddedCheckoutProvider stripe={stripePromise} options={embeddedOptions}>
          <StripeEmbeddedCheckout />
        </EmbeddedCheckoutProvider>
      </div>
    );
  }

  const options: StripeElementsOptions = { clientSecret, appearance };

  return (
    <Elements key={clientSecret} stripe={stripePromise} options={options}>
      <CheckoutInner
        submitLabel={submitLabel}
        onSuccess={onSuccess}
        onError={onError}
        onReady={onReady}
        className={className}
        style={style}
        children={children}
      />
    </Elements>
  );
}
