"use client";

/**
 * UsageMeter — embeddable usage progress bar with automatic color thresholds.
 * Uses --nozle-* CSS variables for theming (customer-facing portal layer).
 *
 * Color thresholds:
 *   < 80%  → primary (normal)
 *   80-94% → warning (amber)
 *   ≥ 95%  → destructive (red)
 */

export function getUsageMeterColor(percentage: number): string {
  if (percentage >= 95) return "var(--nozle-destructive, var(--destructive))";
  if (percentage >= 80) return "var(--nozle-warning, var(--warning))";
  return "var(--nozle-primary, var(--primary))";
}

export interface UsageMeterProps {
  used: number;
  limit: number;
  label?: string;
  showText?: boolean;
}

export function UsageMeter({
  used,
  limit,
  label,
  showText = true,
}: UsageMeterProps) {
  const percentage = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const color = getUsageMeterColor(percentage);

  return (
    <div className="w-full space-y-1">
      {label && (
        <div className="flex justify-between text-sm">
          <span>{label}</span>
          {showText && (
            <span style={{ color }}>
              {used.toLocaleString()} / {limit.toLocaleString()}
            </span>
          )}
        </div>
      )}
      <div
        className="h-2 rounded-full overflow-hidden"
        style={{ background: "var(--nozle-border, var(--border))" }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${percentage}%`,
            background: color,
            transition: "width 0.3s ease",
          }}
        />
      </div>
    </div>
  );
}
