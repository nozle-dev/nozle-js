"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { useOptionalBillingContext } from "../../provider.js";
import { handleCheckoutResult } from "./CheckoutButton.js";

export interface ProrationPreview {
  credit: number;
  debit: number;
  net: number;
  nextBillingDate: string;
  /** Currency of legacy major-unit preview amounts. Defaults to USD for existing integrations. */
  currency?: string;
}

export interface UpgradeModalProps {
  isOpen: boolean;
  planCode: string;
  returnUrl?: string;
  subscriptionId?: string;
  quoteId?: string;
  idempotencyKey?: string;
  preview?: ProrationPreview;
  locale?: string;
  title?: string;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  busy?: boolean;
  nonce?: string;
  children?: React.ReactNode;
  /** Authenticated merchant action. Allows the same confirmation UI without BillingProvider. */
  onSubmit?: () => Promise<void>;
  onStripeClientSecret?: (clientSecret: string) => void;
  onCheckoutStarted?: () => void;
  onCompleted?: () => void;
  onScheduled?: () => void;
  onConfirm?: () => void;
  onCancel?: () => void;
  onError?: (error: Error) => void;
}

const styles = `
.nozle-upgrade-modal{position:fixed;inset:0;background:#0006;display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px;color:var(--nozle-portal-text,#202922);font:inherit}
.nozle-upgrade-modal .nzu-dialog{box-sizing:border-box;background:var(--nozle-portal-background,#fff);border:1px solid var(--nozle-portal-border,#dce2d9);border-radius:12px;padding:24px;max-width:480px;width:100%;max-height:90dvh;overflow:auto;box-shadow:0 12px 48px #0003}
.nozle-upgrade-modal h2{font-size:20px;margin:0 0 16px}
.nozle-upgrade-modal p{line-height:1.55}
.nozle-upgrade-modal button{font:inherit;padding:9px 14px;border:1px solid var(--nozle-portal-border,#dce2d9);border-radius:7px;background:var(--nozle-portal-background,#fff);color:inherit;cursor:pointer}
.nozle-upgrade-modal button:disabled{opacity:.55;cursor:wait}
.nozle-upgrade-modal :focus-visible{outline:2px solid var(--nozle-portal-accent,#526949);outline-offset:3px}
.nozle-upgrade-modal .nzu-buttons{display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-end;margin-top:20px}
.nozle-upgrade-modal [role=alert]{color:#922e25}
`;

export function UpgradeModal(
  props: UpgradeModalProps,
): React.ReactElement | null {
  const billing = useOptionalBillingContext();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const inFlight = useRef(false);
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const busy = Boolean(props.busy || confirming);
  useEffect(() => {
    if (!props.isOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    setError(null);
    dialog.current?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, [props.isOpen]);

  async function handleConfirm(): Promise<void> {
    if (inFlight.current || props.confirmDisabled || busy) return;
    inFlight.current = true;
    setConfirming(true);
    setError(null);
    try {
      if (props.onSubmit) {
        await props.onSubmit();
      } else {
        if (!billing?.createCheckout)
          throw new Error(
            "BillingProvider createCheckout callback is required for checkout",
          );
        const result = await billing.createCheckout({
          planCode: props.planCode,
          returnUrl: props.returnUrl ?? window.location.href,
          ...(props.subscriptionId && { subscriptionId: props.subscriptionId }),
          ...(props.quoteId && { quoteId: props.quoteId }),
          ...(props.idempotencyKey && { idempotencyKey: props.idempotencyKey }),
        });
        await handleCheckoutResult(result, {
          verifyCheckout: billing.verifyCheckout,
          getCheckoutStatus: billing.getCheckoutStatus,
          onSuccess: () => {
            setProcessing(false);
            props.onCompleted?.();
          },
          onProcessing: () => setProcessing(true),
          onStripeClientSecret: (secret) => {
            props.onStripeClientSecret?.(secret);
            props.onCheckoutStarted?.();
          },
          onComplete: () => {
            setProcessing(false);
            props.onCompleted?.();
          },
          onScheduled: () => props.onScheduled?.(),
        });
      }
      props.onConfirm?.();
    } catch (cause) {
      const failure =
        cause instanceof Error ? cause : new Error("Checkout failed");
      setError(failure.message);
      props.onError?.(failure);
    } finally {
      inFlight.current = false;
      setConfirming(false);
    }
  }
  if (!props.isOpen) return null;
  const money = (value: number) =>
    new Intl.NumberFormat(props.locale ?? "en-US", {
      style: "currency",
      currency: props.preview?.currency ?? "USD",
    }).format(value);
  return (
    <div className="nozle-upgrade-modal">
      <style nonce={props.nonce}>{styles}</style>
      <div
        ref={dialog}
        className="nzu-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        aria-busy={busy}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !busy) {
            event.preventDefault();
            props.onCancel?.();
          }
          if (event.key !== "Tab") return;
          const nodes = Array.from(
            dialog.current?.querySelectorAll<HTMLElement>(
              'button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]',
            ) ?? [],
          );
          const first = nodes[0],
            last = nodes[nodes.length - 1];
          if (!first) {
            event.preventDefault();
            return;
          }
          if (
            event.shiftKey &&
            (document.activeElement === first ||
              document.activeElement === dialog.current)
          ) {
            event.preventDefault();
            last.focus();
          }
          if (
            !event.shiftKey &&
            (document.activeElement === last ||
              document.activeElement === dialog.current)
          ) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        <h2 id={titleId}>{props.title ?? "Confirm plan change"}</h2>
        {processing && (
          <p role="status">
            Payment is processing. Confirmation may take a little while.
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        {props.preview && (
          <div>
            {props.preview.credit > 0 && (
              <p>Credits applied: {money(-props.preview.credit)}</p>
            )}
            <p>New plan charge: {money(props.preview.debit)}</p>
            <p>
              <strong>Due today: {money(props.preview.net)}</strong>
            </p>
            <p>
              Next billing date:{" "}
              {new Date(props.preview.nextBillingDate).toLocaleDateString(
                props.locale,
              )}
              .
            </p>
          </div>
        )}
        {props.children}
        <div className="nzu-buttons">
          <button type="button" onClick={props.onCancel} disabled={busy}>
            Close
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={busy || props.confirmDisabled}
          >
            {busy
              ? "Checking subscription…"
              : (props.confirmLabel ?? "Confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
