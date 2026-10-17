"use client";

/**
 * UsageAlert — warning banner shown when any feature usage is >= threshold.
 *
 * Shows dismissible alerts for features approaching their limit.
 * Default threshold: 80% (amber zone entry point).
 */

import { useState } from "react";
import { useAppearance } from "../../appearance/context.js";
import { T, border, text, type Appearance } from "../../appearance/tokens.js";

export interface UsageAlertFeature {
  key: string;
  label: string;
  percentage: number;
}

export interface UsageAlertProps {
  features: UsageAlertFeature[];
  threshold?: number;
  upgradeHref?: string;
  appearance?: Appearance;
}

export function UsageAlert({
  features,
  threshold = 80,
  upgradeHref = "/plans",
  appearance,
}: UsageAlertProps) {
  const { root, el } = useAppearance(appearance);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const alertFeatures = features.filter(
    (f) => f.percentage >= threshold && !dismissed.has(f.key),
  );

  if (alertFeatures.length === 0) {
    return null;
  }

  const handleDismiss = (key: string) => {
    setDismissed((prev) => new Set(prev).add(key));
  };

  return (
    <div {...root("usageAlert", { display: "flex", flexDirection: "column", gap: "0.5rem", ...text.body })}>
      {alertFeatures.map((f) => (
        <div
          key={f.key}
          role="alert"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderRadius: `calc(${T.radius} / 2)`,
            padding: "0.75rem 1rem",
            background: T.warningSoft,
            color: T.warningText,
            border: border(T.warningBorder),
          }}
        >
          <span>
            <span
              aria-hidden="true"
              style={{ marginRight: "0.5rem", fontSize: "1rem" }}
            >
              ⚠
            </span>
            You&apos;re approaching your <strong>{f.label}</strong> limit (
            {Math.round(f.percentage)}%).{" "}
            <a
              href={upgradeHref}
              style={{
                ...text.action,
                color: "inherit",
                textDecoration: "underline",
              }}
            >
              Upgrade
            </a>
          </span>
          <button
            onClick={() => handleDismiss(f.key)}
            aria-label={`Dismiss ${f.label} alert`}
            {...el("usageAlert__dismiss", {
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "0 0 0 0.75rem",
              ...text.action,
              color: "inherit",
            })}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
