"use client";

/**
 * PlanBadge — simple badge displaying plan name with tier-based coloring.
 */

import type React from "react";
import { useAppearance } from "../../appearance/context.js";
import { T, border, text, type Appearance } from "../../appearance/tokens.js";

export interface PlanBadgeProps {
  plan: string;
  tier?: "free" | "starter" | "pro" | "enterprise";
  appearance?: Appearance;
}

const TIER_STYLES: Record<string, React.CSSProperties> = {
  free: { background: T.muted, color: T.mutedForeground, border: border() },
  starter: { background: T.primarySoft, color: T.primary, border: border(`color-mix(in srgb, ${T.primary} 30%, transparent)`) },
  pro: { background: T.primary, color: T.primaryForeground, border: border("transparent") },
  enterprise: { background: T.accent, color: T.accentForeground, border: border("transparent") },
};

export function PlanBadge({ plan, tier = "free", appearance }: PlanBadgeProps) {
  const { root } = useAppearance(appearance);
  const style = TIER_STYLES[tier] ?? TIER_STYLES.free;

  return (
    <span
      {...root("planBadge", {
        ...text.label,
        ...style,
        display: "inline-flex",
        alignItems: "center",
        padding: "0.125rem 0.5rem",
        borderRadius: "9999px",
        whiteSpace: "nowrap",
      })}
    >
      {plan}
    </span>
  );
}
