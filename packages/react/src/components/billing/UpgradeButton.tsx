"use client";

import React, { useState } from "react";
import { useAppearance } from "../../appearance/context.js";
import { buttonStyle, type Appearance } from "../../appearance/tokens.js";
import { UpgradeModal, type ProrationPreview } from "./UpgradeModal.js";

export interface UpgradeButtonProps {
  planCode: string;
  returnUrl?: string;
  subscriptionId?: string;
  quoteId?: string;
  idempotencyKey?: string;
  preview?: ProrationPreview;
  label?: string;
  className?: string;
  appearance?: Appearance;
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
  subscriptionId,
  quoteId,
  idempotencyKey,
  preview,
  label = "Upgrade",
  className,
  style,
  onStripeClientSecret,
  onCheckoutStarted,
  onDowngradeScheduled,
  onUpgraded,
  onError,
  appearance,
}: UpgradeButtonProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const { root } = useAppearance(appearance, 'UpgradeButton');

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        {...root("upgradeButton", { ...buttonStyle(), ...style }, className)}
      >
        {label}
      </button>

      <UpgradeModal
        isOpen={isOpen}
        appearance={appearance}
        planCode={planCode}
        returnUrl={returnUrl}
        subscriptionId={subscriptionId}
        quoteId={quoteId}
        idempotencyKey={idempotencyKey}
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
