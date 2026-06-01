/**
 * UpgradeButton — Opens UpgradeModal on click.
 * UI-02: Triggers plan upgrade flow with proration preview.
 * Uses CSS variable theming with --nozle-* namespace.
 */

"use client";
import React from "react";

import { useState } from "react";
import { UpgradeModal } from "./UpgradeModal.js";
import { useBillingPortal } from "./BillingPortalProvider.js";

export interface UpgradeButtonProps {
  targetPlanId: string;
  label?: string;
  apiBaseUrl?: string;
  className?: string;
  style?: React.CSSProperties;
  onUpgraded?: () => void;
}

/**
 * UpgradeButton opens an UpgradeModal with live proration preview.
 * Must be used inside a BillingPortalProvider.
 */
export function UpgradeButton({
  targetPlanId,
  label = "Upgrade",
  apiBaseUrl = "https://api.nozle.io",
  className,
  style,
  onUpgraded,
}: UpgradeButtonProps): React.ReactElement {
  const { customerId, apiKey } = useBillingPortal();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={className}
        style={{
          padding: "0.75rem 1.5rem",
          borderRadius: "var(--nozle-radius, 0.5rem)",
          border: "none",
          background: "var(--nozle-primary, var(--primary))",
          color: "var(--nozle-primary-foreground, var(--primary-foreground))",
          cursor: "pointer",
          fontWeight: 500,
          ...style,
        }}
      >
        {label}
      </button>

      <UpgradeModal
        isOpen={isOpen}
        targetPlanId={targetPlanId}
        customerId={customerId}
        apiBaseUrl={apiBaseUrl}
        apiKey={apiKey}
        onConfirm={() => {
          setIsOpen(false);
          onUpgraded?.();
        }}
        onCancel={() => setIsOpen(false)}
      />
    </>
  );
}
