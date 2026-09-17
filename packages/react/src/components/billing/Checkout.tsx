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

import {
  useOptionalBillingContext,
  type CheckoutResult,
  type CheckoutStatus,
} from '../../provider.js';
import { handleCheckoutResult } from './CheckoutButton.js';

// ── Public interfaces ────────────────────────────────────────────────────────

export interface StripeCheckoutProps {
  /** Stripe PaymentIntent client secret */
  clientSecret: string;
  /** Stripe publishable key */
  publishableKey: string;
  /** Optional Stripe Connect account ID */
  stripeAccount?: string;
  /** Where Stripe should return the buyer after a redirect-required payment. */
  returnUrl?: string;
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
  const get = (prop: string, fallback: string) =>
    style.getPropertyValue(prop).trim() || fallback;

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
  StripeCheckoutProps,
  | 'submitLabel'
  | 'onSuccess'
  | 'onError'
  | 'onReady'
  | 'className'
  | 'style'
  | 'returnUrl'
> & { children?: React.ReactNode };

function CheckoutInner({
  submitLabel,
  onSuccess,
  onError,
  onReady,
  className,
  style,
  returnUrl,
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
      confirmParams: { return_url: returnUrl ?? window.location.href },
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
              background:
                'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
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
          <p
            style={{
              color: 'var(--nozle-destructive, #dc2626)',
              margin: '0.5rem 0 0',
            }}
          >
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
              color:
                'var(--nozle-primary-foreground, var(--primary-foreground))',
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

function StripeCheckout({
  clientSecret,
  publishableKey,
  stripeAccount,
  returnUrl,
  submitLabel,
  onSuccess,
  onComplete,
  onError,
  onReady,
  className,
  style,
  children,
}: StripeCheckoutProps) {
  const stripePromise = useMemo(
    () =>
      loadStripe(publishableKey, stripeAccount ? { stripeAccount } : undefined),
    [publishableKey, stripeAccount],
  );

  const appearance = useMemo(() => buildStripeAppearance(), []);

  const embeddedOptions = useMemo(
    () => ({ clientSecret, onComplete }),
    [clientSecret, onComplete],
  );

  if (clientSecret.startsWith('cs_')) {
    return (
      <div className={className} style={style}>
        <EmbeddedCheckoutProvider
          stripe={stripePromise}
          options={embeddedOptions}
        >
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
        returnUrl={returnUrl}
        children={children}
      />
    </Elements>
  );
}

export interface ProviderCheckoutProps {
  checkout: CheckoutResult;
  submitLabel?: string;
  onSuccess?: (paymentId: string) => void;
  onComplete?: () => void;
  onProcessing?: (status: CheckoutStatus) => void;
  onError?: (error: Error) => void;
  className?: string;
}

export type CheckoutProps = StripeCheckoutProps | ProviderCheckoutProps;

function ProviderCheckout(props: ProviderCheckoutProps) {
  const billing = useOptionalBillingContext();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [processing, setProcessing] = useState(false);
  const pay = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await handleCheckoutResult(props.checkout, {
        verifyCheckout: billing?.verifyCheckout,
        getCheckoutStatus: billing?.getCheckoutStatus,
        onSuccess: (id) => {
          setProcessing(false);
          props.onSuccess?.(id);
          props.onComplete?.();
        },
        onComplete: () => {
          setProcessing(false);
          props.onComplete?.();
        },
        onProcessing: (status) => {
          setProcessing(true);
          props.onProcessing?.(status);
        },
      });
    } catch (cause) {
      const failure =
        cause instanceof Error ? cause : new Error('Checkout failed');
      setError(failure);
      props.onError?.(failure);
    } finally {
      setBusy(false);
    }
  };
  return (
    <CheckoutContext.Provider
      value={{ confirmPayment: pay, isProcessing: busy, error }}
    >
      <div className={props.className}>
        <button
          type="button"
          disabled={busy}
          aria-busy={busy}
          onClick={() => void pay()}
        >
          {busy ? 'Processing…' : props.submitLabel || 'Pay now'}
        </button>
        {processing && (
          <p role="status">
            Payment is processing. Confirmation may take a little while.
          </p>
        )}
        {error && <p role="alert">{error.message}</p>}
      </div>
    </CheckoutContext.Provider>
  );
}

export function Checkout(props: CheckoutProps) {
  return 'checkout' in props ? (
    <ProviderCheckout {...props} />
  ) : (
    <StripeCheckout {...props} />
  );
}
