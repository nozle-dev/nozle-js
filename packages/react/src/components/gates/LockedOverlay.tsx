/**
 * LockedOverlay — Wraps children with a blur filter + upgrade CTA overlay when locked.
 * UI-03: Applies CSS blur(4px) to children with an upgrade prompt overlay.
 * Themed through `appearance` (see the appearance tokens).
 */

"use client";

import React, { type ReactNode } from "react";
import { UpgradePrompt } from "./UpgradePrompt.js";
import { useAppearance } from "../../appearance/context.js";
import { T, type Appearance } from "../../appearance/tokens.js";

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
  appearance?: Appearance;
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
  appearance,
}: LockedOverlayProps): React.ReactElement {
  const { root, el } = useAppearance(appearance);
  if (!locked) {
    return <>{children}</>;
  }

  return (
    <div {...root("lockedOverlay", { position: "relative", display: "inline-block" })}>
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
        {...el("lockedOverlay__panel", {
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: `color-mix(in srgb, ${T.background} 92%, transparent)`,
          borderRadius: T.radius,
        })}
        role="dialog"
        aria-label="Feature locked — upgrade required"
      >
        <UpgradePrompt
          text={upgradeText}
          planName={upgradePlanName}
          onUpgrade={onUpgrade}
          appearance={appearance}
        />
      </div>
    </div>
  );
}
