"use client";

/**
 * UsageMeter — embeddable usage progress bar with automatic color thresholds.
 * Colours come from the appearance tokens (see `appearance`).
 *
 * Color thresholds:
 *   < 80%  → primary (normal)
 *   80-94% → warning (amber)
 *   ≥ 95%  → destructive (red)
 */
import { useAppearance } from "../../appearance/context.js";
import { T, type Appearance } from "../../appearance/tokens.js";

export function getUsageMeterColor(percentage: number): string {
  if (percentage >= 95) return T.danger;
  if (percentage >= 80) return T.warning;
  return T.primary;
}

export interface UsageMeterProps {
  used: number;
  /** `null` or `undefined` means the feature has no limit. */
  limit?: number | null;
  label?: string;
  showText?: boolean;
  appearance?: Appearance;
}

export function UsageMeter({
  used,
  limit,
  label,
  showText = true,
  appearance,
}: UsageMeterProps) {
  const { root, el } = useAppearance(appearance);
  const unlimited = limit == null;
  const percentage = !unlimited && limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const color = getUsageMeterColor(percentage);

  return (
    <div
      {...root("usageMeter", {
        width: "100%",
        display: "flex",
        flexDirection: "column",
        gap: "0.25rem",
        fontFamily: T.font,
        color: T.foreground,
      })}
    >
      {label && (
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem" }}>
          <span {...el("usageMeter__label")}>{label}</span>
          {showText && (
            <span {...el("usageMeter__value", { color })}>
              {used.toLocaleString()} / {unlimited ? "Unlimited" : limit.toLocaleString()}
            </span>
          )}
        </div>
      )}
      <div
        {...el("usageMeter__track", {
          height: "0.5rem",
          borderRadius: "9999px",
          overflow: "hidden",
          background: T.muted,
        })}
      >
        <div
          {...el("usageMeter__fill", {
            height: "100%",
            borderRadius: "9999px",
            width: `${percentage}%`,
            background: color,
            transition: "width 0.3s ease",
          })}
        />
      </div>
    </div>
  );
}
