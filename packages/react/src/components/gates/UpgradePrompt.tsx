/**
 * UpgradePrompt — Reusable upgrade message component.
 * UI-03: Shows plan name + upgrade button; used as default fallback for LockedOverlay.
 * Themed through `appearance` (see the appearance tokens).
 */

"use client";

import React from "react";
import { useAppearance } from "../../appearance/context.js";
import { buttonStyle, text as role, type Appearance } from "../../appearance/tokens.js";

export interface UpgradePromptProps {
  text?: string;
  planName?: string;
  onUpgrade?: () => void;
  appearance?: Appearance;
}

/**
 * UpgradePrompt renders an upgrade call-to-action with a message and button.
 * Used as default fallback in LockedOverlay and gate components.
 */
export function UpgradePrompt({
  text = "Upgrade to access this feature",
  planName,
  onUpgrade,
  appearance,
}: UpgradePromptProps): React.ReactElement {
  const { root } = useAppearance(appearance, 'UpgradePrompt');
  const displayText = planName
    ? `Upgrade to ${planName} to access this feature`
    : text;

  function handleUpgrade(): void {
    if (onUpgrade) {
      onUpgrade();
    } else {
      window.location.href = "/upgrade";
    }
  }

  return (
    <div
      {...root("upgradePrompt", {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.75rem",
        padding: "1rem",
        textAlign: "center",
        ...role.body,
      })}
    >
      <p style={{ margin: 0 }}>
        {displayText}
      </p>
      <button type="button"
        onClick={handleUpgrade}
        style={{ ...buttonStyle(), padding: "0.5rem 1.25rem" }}
      >
        Upgrade
      </button>
    </div>
  );
}
