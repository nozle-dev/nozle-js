"use client";

/**
 * UsageAlert — warning banner shown when any feature usage is >= threshold.
 *
 * Shows dismissible alerts for features approaching their limit.
 * Default threshold: 80% (amber zone entry point).
 */

import { useState } from "react";

export interface UsageAlertFeature {
  key: string;
  label: string;
  percentage: number;
}

export interface UsageAlertProps {
  features: UsageAlertFeature[];
  threshold?: number;
  upgradeHref?: string;
}

export function UsageAlert({
  features,
  threshold = 80,
  upgradeHref = "/plans",
}: UsageAlertProps) {
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
    <div className="space-y-2">
      {alertFeatures.map((f) => (
        <div
          key={f.key}
          role="alert"
          className="flex items-center justify-between rounded-md px-4 py-3 text-sm"
          style={{
            background: "var(--nozle-warning-bg, var(--warning-bg, #fef9c3))",
            color: "var(--nozle-warning-text, var(--warning-text, #854d0e))",
            border:
              "1px solid var(--nozle-warning-border, var(--warning-border, #fde047))",
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
                color: "inherit",
                fontWeight: 600,
                textDecoration: "underline",
              }}
            >
              Upgrade
            </a>
          </span>
          <button
            onClick={() => handleDismiss(f.key)}
            aria-label={`Dismiss ${f.label} alert`}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "0 0 0 0.75rem",
              fontSize: "1rem",
              color: "inherit",
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
