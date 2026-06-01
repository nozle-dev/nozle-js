/**
 * LockedOverlay — Wraps children with a blur filter + upgrade CTA overlay when locked.
 * UI-03: Applies CSS blur(4px) to children with an upgrade prompt overlay.
 * Uses CSS variable theming with --nozle-* namespace.
 */

"use client";

import React, { type ReactNode } from "react";
import { UpgradePrompt } from "./UpgradePrompt.js";

export interface LockedOverlayProps {
  /** Whether to apply the locked blur + overlay state */
  locked: boolean;
  /** Text to show in the upgrade prompt */
  upgradeText?: string;
  /** Plan name to show in the upgrade prompt */
  upgradePlanName?: string;
  /** Called when the upgrade button is clicked */
  onUpgrade?: () => void;
  /** Content to blur when locked */
  children: ReactNode;
}

/**
 * LockedOverlay wraps children in a relative container.
 * When locked=true:
 *   - Children receive CSS blur(4px) and pointer-events: none
 *   - An upgrade CTA overlay is positioned on top
 *
 * When locked=false, children render normally without any overlay.
 *
 * Usage:
 * ```tsx
 * <LockedOverlay locked={!canAccessFeature} upgradeText="Upgrade to Pro" onUpgrade={openUpgradeModal}>
 *   <FeatureContent />
 * </LockedOverlay>
 * ```
 */
export function LockedOverlay({
  locked,
  upgradeText,
  upgradePlanName,
  onUpgrade,
  children,
}: LockedOverlayProps): React.ReactElement {
  if (!locked) {
    return <>{children}</>;
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      {/* Blurred content — inaccessible to users */}
      <div
        style={{
          filter: "blur(4px)",
          pointerEvents: "none",
          userSelect: "none",
        }}
        aria-hidden="true"
      >
        {children}
      </div>

      {/* Upgrade CTA overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--nozle-background, var(--background))",
          opacity: 0.92,
          borderRadius: "var(--nozle-radius, 0.5rem)",
        }}
        role="dialog"
        aria-label="Feature locked — upgrade required"
      >
        <UpgradePrompt
          text={upgradeText}
          planName={upgradePlanName}
          onUpgrade={onUpgrade}
        />
      </div>
    </div>
  );
}
