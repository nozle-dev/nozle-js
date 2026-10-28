"use client";

import React, { useRef, useState } from "react";
import { useAppearance } from "../../appearance/context.js";
import { T, buttonStyle, text, type Appearance } from "../../appearance/tokens.js";
import {
  useBillingContext,
  type CheckoutResult,
  type CompletedCheckoutResult,
  type ScheduledCheckoutResult,
} from "../../provider.js";

import {
  openRazorpayCheckout,
  resumeCheckout,
  type RazorpayActions,
} from "./razorpay-checkout.js";
import { navigateToCheckout } from "./checkout-navigation.js";

/** Sell a plan code, or a plan family's variant for an interval (and `currency`). */
export type CheckoutButtonProps = CheckoutButtonBaseProps &
  (
    | { planCode: string; planFamilyCode?: undefined; interval?: undefined }
    | { planCode?: undefined; planFamilyCode: string; interval: string }
  );

export interface CheckoutButtonBaseProps
  extends Omit<RazorpayActions, "verifyCheckout" | "getCheckoutStatus"> {
  /** ISO code of the currency the customer chose; passed to `createCheckout` as `currency`. */
  currency?: string;
  /** Where the customer comes back to. Defaults to the current page without its query string or hash. */
  returnUrl?: string;
  /** Where Stripe sends a customer who leaves the hosted page. Defaults to the return URL. */
  cancelUrl?: string;
  label?: string;
  className?: string;
  appearance?: Appearance;
  style?: React.CSSProperties;
  /** Receives the raw error (an SDK or billing-route error); the button itself shows `errorMessage`. */
  onError?: (error: Error) => void;
  /** Shown under the button when checkout fails. Defaults to a generic retry message. */
  errorMessage?: string;
  /** @deprecated The server supplies the public Razorpay key in the checkout response. */
  razorpayKeyId?: string;
  registerMandate?: boolean;
  onSuccess?: (paymentId: string) => void;
  onComplete?: (result: CompletedCheckoutResult) => void;
  onScheduled?: (result: ScheduledCheckoutResult) => void;
}

export async function handleCheckoutResult(
  result: CheckoutResult,
  options: Pick<
    CheckoutButtonBaseProps,
    | "razorpayKeyId"
    | "onSuccess"
    | "onComplete"
    | "onScheduled"
  > &
    RazorpayActions,
): Promise<void> {
  if ("type" in result && result.type === "scheduled") {
    options.onScheduled?.(result);
    return;
  }
  if ("type" in result && result.type === "completed") {
    options.onComplete?.(result);
    return;
  }
  if ("type" in result && result.type === "razorpay") {
    await openRazorpayCheckout(result, options);
    return;
  }
  if ("type" in result && result.type === "processing") {
    const next = await resumeCheckout(result, options);
    if (next) await handleCheckoutResult(next, options);
    return;
  }
  if ("type" in result && result.type === "hosted") {
    navigateToCheckout(result.url);
    return;
  }
  if ("url" in result && result.url) {
    navigateToCheckout(result.url);
    return;
  }
  throw new Error("Unknown checkout response format");
}

function currentPageUrl(): string {
  const { origin, pathname } = window.location;
  return origin && pathname ? `${origin}${pathname}` : window.location.href;
}

export function CheckoutButton({
  planCode,
  planFamilyCode,
  interval,
  currency,
  returnUrl,
  cancelUrl,
  label = "Get Started",
  className,
  style,
  onError,
  errorMessage = "We couldn't start checkout. Please try again.",
  razorpayKeyId,
  registerMandate,
  onProcessing,
  onDismiss,
  onSuccess,
  onComplete,
  onScheduled,
  appearance,
}: CheckoutButtonProps): React.ReactElement {
  const { root, vars } = useAppearance(appearance, 'CheckoutButton');
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
          "BillingProvider createCheckout callback is required for checkout",
        );
      }
      const selection = planFamilyCode !== undefined
        ? { planFamilyCode, interval: interval! }
        : { planCode: planCode! };
      // A new key whenever what is sold changes, so a retry of the same choice stays one checkout.
      const plan = JSON.stringify([planCode, planFamilyCode, interval, currency]);
      if (attempt.current?.plan !== plan)
        attempt.current = { plan, key: crypto.randomUUID() };
      const result = await createCheckout({
        idempotencyKey: attempt.current.key,
        ...(registerMandate !== undefined && { registerMandate }),
        ...selection,
        ...(currency && { currency }),
        returnUrl: returnUrl ?? currentPageUrl(),
        ...(cancelUrl && { cancelUrl }),
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
        cause instanceof Error ? cause : new Error("Checkout failed");
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
        {...root("checkoutButton", { ...buttonStyle("primary", loading), ...style }, className)}
        aria-busy={loading}
      >
        {loading ? "Loading..." : label}
      </button>
      {processing && (
        <span role="status" style={{ ...vars, ...text.body }}>
          Payment is processing. Confirmation may take a little while.
        </span>
      )}
      {error && <span role="alert" style={{ ...vars, ...text.body, color: T.dangerText }}>{errorMessage}</span>}
    </>
  );
}
