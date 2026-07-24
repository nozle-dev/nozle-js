'use client';

import React, { useState } from 'react';
import { useBillingContext } from '../../provider.js';
import { handleCheckoutResult } from './CheckoutButton.js';

export interface ProrationPreview {
  credit: number;
  debit: number;
  net: number;
  nextBillingDate: string;
}

export interface UpgradeModalProps {
  isOpen: boolean;
  planCode: string;
  returnUrl?: string;
  preview?: ProrationPreview;
  onStripeClientSecret?: (clientSecret: string) => void;
  onCheckoutStarted?: () => void;
  onCompleted?: () => void;
  onScheduled?: () => void;
  onConfirm?: () => void;
  onCancel?: () => void;
  onError?: (error: Error) => void;
}

export function UpgradeModal({
  isOpen,
  planCode,
  returnUrl,
  preview,
  onStripeClientSecret,
  onCheckoutStarted,
  onCompleted,
  onScheduled,
  onConfirm,
  onCancel,
  onError,
}: UpgradeModalProps): React.ReactElement | null {
  const { createCheckout } = useBillingContext();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function handleConfirm(): Promise<void> {
    setConfirming(true);
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
        onStripeClientSecret: (clientSecret) => {
          onStripeClientSecret?.(clientSecret);
          onCheckoutStarted?.();
        },
        onComplete: () => onCompleted?.(),
        onScheduled: () => onScheduled?.(),
      });
      onConfirm?.();
    } catch (cause) {
      const checkoutError = cause instanceof Error ? cause : new Error('Checkout failed');
      setError(checkoutError.message);
      onError?.(checkoutError);
    } finally {
      setConfirming(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'oklch(0 0 0 / 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Change plan"
    >
      <div
        style={{
          background: 'var(--nozle-background, var(--background))',
          color: 'var(--nozle-foreground, var(--foreground))',
          border: '1px solid var(--nozle-border, var(--border))',
          borderRadius: 'var(--nozle-radius, 0.5rem)',
          padding: '2rem',
          maxWidth: '28rem',
          width: '100%',
          boxShadow: 'var(--nozle-shadow, 0 4px 6px -1px rgb(0 0 0 / 0.1))',
        }}
      >
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: '0 0 1rem' }}>
          Confirm plan change
        </h2>

        {error && <p role="alert" style={{ color: 'oklch(0.6 0.2 25)' }}>{error}</p>}

        {preview && (
          <div style={{ marginBottom: '1.5rem' }}>
            <div
              style={{
                background: 'var(--nozle-muted, var(--muted))',
                borderRadius: 'var(--nozle-radius, 0.5rem)',
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              {preview.credit > 0 && <div>Credits applied: -${preview.credit.toFixed(2)}</div>}
              <div>New plan charge: ${preview.debit.toFixed(2)}</div>
              <strong>Due today: ${preview.net.toFixed(2)}</strong>
            </div>
            <p style={{ fontSize: '0.875rem' }}>
              Next billing date: {new Date(preview.nextBillingDate).toLocaleDateString()}.
            </p>
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel} disabled={confirming}>Cancel</button>
          <button type="button" onClick={() => void handleConfirm()} disabled={confirming}>
            {confirming ? 'Starting checkout...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
