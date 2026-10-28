"use client";

import React, { createContext, useContext, useState } from "react";
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

export interface UseCheckoutResult {
  /** Start the payment: redirects to a hosted page or opens the Razorpay modal */
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

export type CheckoutProps = ProviderCheckoutProps;

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
      <ProviderCheckout {...props} />
    </NozleBranding>
  );
}
