/**
 * UpgradePrompt — Reusable upgrade message component.
 * UI-03: Shows plan name + upgrade button; used as default fallback for LockedOverlay.
 * Uses CSS variable theming with --nozle-* namespace.
 */

"use client";

import React from "react";

export interface UpgradePromptProps {
  text?: string;
  planName?: string;
  onUpgrade?: () => void;
}

/**
 * UpgradePrompt renders an upgrade call-to-action with a message and button.
 * Used as default fallback in LockedOverlay and gate components.
 */
export function UpgradePrompt({
  text = "Upgrade to access this feature",
  planName,
  onUpgrade,
}: UpgradePromptProps): React.ReactElement {
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
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.75rem",
        padding: "1rem",
        textAlign: "center",
      }}
    >
      <p
        style={{
          color: "var(--nozle-foreground, var(--foreground))",
          fontSize: "0.875rem",
          margin: 0,
        }}
      >
        {displayText}
      </p>
      <button
        onClick={handleUpgrade}
        style={{
          padding: "0.5rem 1.25rem",
          borderRadius: "var(--nozle-radius, 0.5rem)",
          border: "none",
          background: "var(--nozle-primary, var(--primary))",
          color: "var(--nozle-primary-foreground, var(--primary-foreground))",
          cursor: "pointer",
          fontWeight: 500,
          fontSize: "0.875rem",
        }}
      >
        Upgrade
      </button>
    </div>
  );
}
