'use client';

import React, { useState } from 'react';
import { UpgradeModal, type ProrationPreview } from './UpgradeModal.js';

export interface UpgradeButtonProps {
  planCode: string;
  returnUrl?: string;
  preview?: ProrationPreview;
  label?: string;
  className?: string;
  style?: React.CSSProperties;
  onStripeClientSecret?: (clientSecret: string) => void;
  onCheckoutStarted?: () => void;
  onDowngradeScheduled?: () => void;
  onUpgraded?: () => void;
  onError?: (error: Error) => void;
}

export function UpgradeButton({
  planCode,
  returnUrl,
  preview,
  label = 'Upgrade',
  className,
  style,
  onStripeClientSecret,
  onCheckoutStarted,
  onDowngradeScheduled,
  onUpgraded,
  onError,
}: UpgradeButtonProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={className}
        style={{
          padding: '0.75rem 1.5rem',
          borderRadius: 'var(--nozle-radius, 0.5rem)',
          border: 'none',
          background: 'var(--nozle-primary, var(--primary))',
          color: 'var(--nozle-primary-foreground, var(--primary-foreground))',
          cursor: 'pointer',
          fontWeight: 500,
          ...style,
        }}
      >
        {label}
      </button>

      <UpgradeModal
        isOpen={isOpen}
        planCode={planCode}
        returnUrl={returnUrl}
        preview={preview}
        onStripeClientSecret={onStripeClientSecret}
        onCheckoutStarted={() => {
          setIsOpen(false);
          onCheckoutStarted?.();
        }}
        onCompleted={() => {
          setIsOpen(false);
          onUpgraded?.();
        }}
        onScheduled={() => {
          setIsOpen(false);
          onDowngradeScheduled?.();
        }}
        onError={onError}
        onCancel={() => setIsOpen(false)}
      />
    </>
  );
}
