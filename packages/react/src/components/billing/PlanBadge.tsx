"use client";

/**
 * PlanBadge — simple badge displaying plan name with tier-based coloring.
 */

import type React from "react";

export interface PlanBadgeProps {
  plan: string;
  tier?: "free" | "starter" | "pro" | "enterprise";
}

const TIER_STYLES: Record<string, React.CSSProperties> = {
  free: {
    background: "var(--nozle-muted, var(--muted, #f1f5f9))",
    color: "var(--nozle-muted-foreground, var(--muted-foreground, #64748b))",
    border: "1px solid var(--nozle-border, var(--border, #e2e8f0))",
  },
  starter: {
    background:
      "color-mix(in srgb, var(--nozle-primary, var(--primary, #3b82f6)) 10%, transparent)",
    color: "var(--nozle-primary, var(--primary, #3b82f6))",
    border:
      "1px solid color-mix(in srgb, var(--nozle-primary, var(--primary, #3b82f6)) 30%, transparent)",
  },
  pro: {
    background: "var(--nozle-primary, var(--primary, #3b82f6))",
    color:
      "var(--nozle-primary-foreground, var(--primary-foreground, #ffffff))",
    border: "1px solid transparent",
  },
  enterprise: {
    background: "var(--nozle-accent, var(--accent, #8b5cf6))",
    color: "var(--nozle-accent-foreground, var(--accent-foreground, #ffffff))",
    border: "1px solid transparent",
  },
};

export function PlanBadge({ plan, tier = "free" }: PlanBadgeProps) {
  const style = TIER_STYLES[tier] ?? TIER_STYLES.free;

  return (
    <span
      style={{
        ...style,
        display: "inline-flex",
        alignItems: "center",
        padding: "0.125rem 0.5rem",
        borderRadius: "9999px",
        fontSize: "0.75rem",
        fontWeight: 600,
        lineHeight: "1.25rem",
        whiteSpace: "nowrap",
      }}
    >
      {plan}
    </span>
  );
}
