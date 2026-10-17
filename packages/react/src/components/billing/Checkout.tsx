"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  EmbeddedCheckout as StripeEmbeddedCheckout,
  EmbeddedCheckoutProvider,
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import type { Appearance as StripeAppearance, StripeElementsOptions } from "@stripe/stripe-js";
import { useAppearance } from "../../appearance/context.js";
import { NozleBranding } from "../branding/PoweredByNozle.js";
import { T, buttonStyle, text, type Appearance } from "../../appearance/tokens.js";

import {
  useOptionalBillingContext,
  type CheckoutResult,
  type CheckoutStatus,
  type VerifyCheckout,
  type GetCheckoutStatus,
} from "../../provider.js";
import { handleCheckoutResult } from "./CheckoutButton.js";

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
  /**
   * Called when an embedded Checkout Session completes without a redirect. It does
   * not fire when the session redirects to `returnUrl`: show success from the return
   * page, or reload billing status there.
   */
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
  /** Also passed to Stripe's Payment Element. Stripe's embedded Checkout uses your Stripe branding instead. */
  appearance?: Appearance;
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
    throw new Error("useCheckout must be used inside a <Checkout> component");
  }
  return ctx;
}

// ── Stripe appearance builder ─────────────────────────────────────────────────

/** Colours resolved by the browser (any CSS colour syntax), read from a probe element. */
export interface ResolvedColors {
  primary?: string;
  background?: string;
  foreground?: string;
  danger?: string;
  radius?: string;
  font?: string;
}

function rgb(color: string | undefined): [number, number, number] | null {
  const match = color?.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

// Stripe reads hex and rgb colours; a colour the browser reports in another space is left to Stripe's theme.
function stripeColor(color: string | undefined): string | undefined {
  return rgb(color) ? color : color?.startsWith("#") ? color : undefined;
}

/** Maps the theme's resolved colours to Stripe's appearance; a dark background picks Stripe's `night` theme. */
export function toStripeAppearance(colors: ResolvedColors): StripeAppearance {
  const background = rgb(colors.background);
  const dark = background ? (0.2126 * background[0] + 0.7152 * background[1] + 0.0722 * background[2]) / 255 < 0.5 : false;
  const variables = Object.fromEntries(
    Object.entries({
      colorPrimary: stripeColor(colors.primary),
      colorBackground: stripeColor(colors.background),
      colorText: stripeColor(colors.foreground),
      colorDanger: stripeColor(colors.danger),
      borderRadius: colors.radius,
      fontFamily: colors.font,
    }).filter(([, value]) => value),
  );
  return { theme: dark ? "night" : "stripe", variables };
}

/** A hidden element styled with the theme tokens, whose computed colours feed Stripe. */
function useStripeAppearance(appearanceKey: unknown) {
  const probe = useRef<HTMLSpanElement>(null);
  const [stripeAppearance, setStripeAppearance] = useState<StripeAppearance | null>(null);
  useEffect(() => {
    if (!probe.current) return;
    const style = getComputedStyle(probe.current);
    setStripeAppearance(
      toStripeAppearance({
        primary: style.color,
        background: style.backgroundColor,
        foreground: style.borderTopColor,
        danger: style.borderBottomColor,
        radius: style.borderTopLeftRadius,
        font: style.fontFamily,
      }),
    );
  }, [appearanceKey]);
  const probeElement = (
    <span
      ref={probe}
      aria-hidden="true"
      style={{
        display: "none",
        color: T.primary,
        backgroundColor: T.card,
        borderTop: `1px solid ${T.foreground}`,
        borderBottom: `1px solid ${T.danger}`,
        borderRadius: T.radius,
        fontFamily: T.font,
      }}
    />
  );
  return { probeElement, stripeAppearance };
}

// ── Inner form component ──────────────────────────────────────────────────────

type CheckoutInnerProps = Pick<
  StripeCheckoutProps,
  | "submitLabel"
  | "onSuccess"
  | "onError"
  | "onReady"
  | "className"
  | "style"
  | "returnUrl"
  | "appearance"
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
  appearance,
}: CheckoutInnerProps) {
  const stripe = useStripe();
  const elements = useElements();
  const { el } = useAppearance(appearance);

  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isReady, setIsReady] = useState(false);
  const inFlight = useRef(false);

  async function confirmPayment(): Promise<void> {
    if (!stripe || !elements || inFlight.current) return;

    inFlight.current = true;
    setIsProcessing(true);
    setError(null);
    try {
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: returnUrl ?? window.location.href },
        redirect: "if_required",
      });
      if (result.error) {
        const err = new Error(result.error.message ?? "Payment failed");
        setError(err);
        onError?.(err);
      } else if (result.paymentIntent?.status === "succeeded") {
        onSuccess?.(result.paymentIntent.id);
      }
    } catch {
      const failure = new Error(
        "Payment could not be confirmed. Check its status before retrying.",
      );
      setError(failure);
      onError?.(failure);
    } finally {
      inFlight.current = false;
      setIsProcessing(false);
    }
  }

  return (
    <CheckoutContext.Provider value={{ confirmPayment, isProcessing, error }}>
      <div>
        <style>{`@keyframes nozle-skeleton-pulse { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>

        {!isReady && (
          <div
            data-testid="checkout-skeleton"
            style={{
              height: "200px",
              borderRadius: T.radius,
              background: `linear-gradient(90deg, ${T.muted} 25%, ${T.skeleton} 50%, ${T.muted} 75%)`,
              backgroundSize: "200% 100%",
              animation: "nozle-skeleton-pulse 1.5s ease-in-out infinite",
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
          <p {...el("checkout__error", { color: T.dangerText, margin: "0.5rem 0 0" })}>
            {error.message}
          </p>
        )}

        {children ?? (
          <button
            type="button"
            onClick={() => void confirmPayment()}
            disabled={isProcessing || !stripe}
            aria-busy={isProcessing}
            {...el("checkout__submit", { ...buttonStyle("primary", isProcessing), marginTop: "1rem", width: "100%" })}
          >
            {isProcessing ? "Processing..." : (submitLabel ?? "Pay now")}
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
  appearance: themeAppearance,
}: StripeCheckoutProps) {
  const { root } = useAppearance(themeAppearance);
  // Re-read the colours whenever the resolved theme variables change, from the provider or this component.
  const { probeElement, stripeAppearance } = useStripeAppearance(JSON.stringify(root("checkout").style));
  const stripePromise = useMemo(
    () =>
      loadStripe(publishableKey, stripeAccount ? { stripeAccount } : undefined),
    [publishableKey, stripeAccount],
  );

  const embeddedOptions = useMemo(
    () => ({ clientSecret, onComplete }),
    [clientSecret, onComplete],
  );

  if (clientSecret.startsWith("cs_")) {
    return (
      <div {...root("checkout", { ...text.body, ...style }, className)}>
        <EmbeddedCheckoutProvider
          stripe={stripePromise}
          options={embeddedOptions}
        >
          <StripeEmbeddedCheckout />
        </EmbeddedCheckoutProvider>
      </div>
    );
  }

  const options: StripeElementsOptions | null = stripeAppearance && { clientSecret, appearance: stripeAppearance };

  return (
    <div {...root("checkout", { ...text.body, ...style }, className)}>
      {probeElement}
      {options && (
        <Elements key={clientSecret} stripe={stripePromise} options={options}>
          <CheckoutInner
            submitLabel={submitLabel}
            onSuccess={onSuccess}
            onError={onError}
            onReady={onReady}
            returnUrl={returnUrl}
            children={children}
            appearance={themeAppearance}
          />
        </Elements>
      )}
    </div>
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
  returnUrl?: string;
  verifyCheckout?: VerifyCheckout;
  getCheckoutStatus?: GetCheckoutStatus;
  onDismiss?: () => void;
  appearance?: Appearance;
}

export type CheckoutProps = StripeCheckoutProps | ProviderCheckoutProps;

function ProviderCheckout(props: ProviderCheckoutProps) {
  const billing = useOptionalBillingContext();
  const { root, el } = useAppearance(props.appearance);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [processing, setProcessing] = useState(false);
  const pay = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await handleCheckoutResult(props.checkout, {
        verifyCheckout: props.verifyCheckout ?? billing?.verifyCheckout,
        getCheckoutStatus:
          props.getCheckoutStatus ?? billing?.getCheckoutStatus,
        onDismiss: props.onDismiss,
        onSuccess: (id) => {
          setProcessing(false);
          props.onSuccess?.(id);
          props.onComplete?.();
        },
        onComplete: () => {
          setProcessing(false);
          props.onComplete?.();
        },
        onScheduled: () => props.onComplete?.(),
        onProcessing: (status) => {
          setProcessing(true);
          props.onProcessing?.(status);
        },
      });
    } catch (cause) {
      const failure =
        cause instanceof Error ? cause : new Error("Checkout failed");
      setError(failure);
      props.onError?.(failure);
    } finally {
      setBusy(false);
    }
  };
  if (
    "type" in props.checkout &&
    props.checkout.type === "stripe" &&
    !props.checkout.url
  ) {
    const result = props.checkout;
    const clientSecret = result.clientSecret ?? result.client_secret;
    if (clientSecret && result.publishable_key) {
      return (
        <StripeCheckout
          clientSecret={clientSecret}
          publishableKey={result.publishable_key}
          stripeAccount={result.stripe_account}
          returnUrl={props.returnUrl}
          submitLabel={props.submitLabel}
          onSuccess={props.onSuccess}
          onComplete={props.onComplete}
          onError={props.onError}
          className={props.className}
          appearance={props.appearance}
        />
      );
    }
    return (
      <p {...root("checkout", { ...text.body, color: T.dangerText }, props.className)} role="alert">
        Payment setup is incomplete. Contact support to continue.
      </p>
    );
  }
  return (
    <CheckoutContext.Provider
      value={{ confirmPayment: pay, isProcessing: busy, error }}
    >
      <div {...root("checkout", text.body, props.className)}>
        <button
          type="button"
          disabled={busy}
          aria-busy={busy}
          onClick={() => void pay()}
          {...el("checkout__submit", buttonStyle("primary", busy))}
        >
          {busy ? "Processing…" : props.submitLabel || "Pay now"}
        </button>
        {processing && (
          <p role="status">
            Payment is processing. Confirmation may take a little while.
          </p>
        )}
        {error && (
          <p role="alert" {...el("checkout__error", { color: T.dangerText })}>
            {error.message}
          </p>
        )}
      </div>
    </CheckoutContext.Provider>
  );
}

export function Checkout(props: CheckoutProps) {
  return (
    <NozleBranding>
      {"checkout" in props ? <ProviderCheckout {...props} /> : <StripeCheckout {...props} />}
    </NozleBranding>
  );
}
