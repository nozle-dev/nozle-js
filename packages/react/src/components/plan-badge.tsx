import { usePlan } from "../hooks/use-plan";
import type { CSSProperties } from "react";
import type { PlanBadgeProps } from "./types";

const fontFamily =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const statusColorMap: Record<string, { dot: string; bg: string; text: string }> = {
  active:     { dot: "#22c55e", bg: "rgba(34, 197, 94, 0.08)",  text: "#15803d" },
  trialing:   { dot: "#6366f1", bg: "rgba(99, 102, 241, 0.08)", text: "#4f46e5" },
  past_due:   { dot: "#f59e0b", bg: "rgba(245, 158, 11, 0.08)", text: "#b45309" },
  canceled:   { dot: "#6b7280", bg: "rgba(107, 114, 128, 0.08)", text: "#4b5563" },
  unpaid:     { dot: "#ef4444", bg: "rgba(239, 68, 68, 0.08)",  text: "#dc2626" },
  incomplete: { dot: "#f59e0b", bg: "rgba(245, 158, 11, 0.08)", text: "#b45309" },
};
const defaultStatusColors = { dot: "#6366f1", bg: "rgba(99, 102, 241, 0.08)", text: "#4f46e5" };

function getStatusColors(status: string) {
  return statusColorMap[status] ?? defaultStatusColors;
}

let skeletonStyleInjected = false;
function ensureKeyframes() {
  if (skeletonStyleInjected || typeof document === "undefined") return;
  const sheet = document.createElement("style");
  sheet.textContent = `@keyframes nozle-pulse{0%,100%{opacity:1}50%{opacity:.4}}`;
  document.head.appendChild(sheet);
  skeletonStyleInjected = true;
}

export function PlanBadge({
  variant = "pill",
  className,
  style,
  ...props
}: PlanBadgeProps) {
  const { data, isLoading, error } = usePlan();

  if (isLoading) {
    ensureKeyframes();
    if (variant === "icon") {
      return (
        <span
          data-nozle="plan-badge"
          data-variant="icon"
          className={className}
          style={{
            display: "inline-block",
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "#e5e7eb",
            animation: "nozle-pulse 1.5s ease-in-out infinite",
            ...style,
          }}
          {...props}
        />
      );
    }
    return (
      <span
        data-nozle="plan-badge"
        data-variant={variant}
        className={className}
        style={{
          display: "inline-block",
          width: 72,
          height: 22,
          borderRadius: variant === "pill" ? 999 : 4,
          background: "#e5e7eb",
          animation: "nozle-pulse 1.5s ease-in-out infinite",
          ...style,
        }}
        {...props}
      />
    );
  }

  if (error || !data) return null;

  const statusLabel = data.subscription_status.replace(/_/g, " ");
  const colors = getStatusColors(data.subscription_status);
  const planName = data.plan_slug;

  if (variant === "text") {
    const textStyle: CSSProperties = {
      fontFamily,
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      fontSize: 14,
      fontWeight: 500,
      color: "#111827",
      ...style,
    };
    const dotStyle: CSSProperties = {
      width: 8,
      height: 8,
      borderRadius: "50%",
      background: colors.dot,
      flexShrink: 0,
    };
    return (
      <span
        data-nozle="plan-badge"
        data-variant="text"
        data-status={data.subscription_status}
        className={className}
        style={textStyle}
        {...props}
      >
        <span style={dotStyle} aria-hidden="true" />
        {planName}
      </span>
    );
  }

  if (variant === "icon") {
    const iconStyle: CSSProperties = {
      fontFamily,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 32,
      height: 32,
      borderRadius: "50%",
      background: colors.bg,
      color: colors.text,
      fontSize: 14,
      fontWeight: 700,
      lineHeight: 1,
      flexShrink: 0,
      ...style,
    };
    return (
      <span
        data-nozle="plan-badge"
        data-variant="icon"
        data-status={data.subscription_status}
        className={className}
        style={iconStyle}
        title={`${planName} (${statusLabel})`}
        {...props}
      >
        {planName.charAt(0).toUpperCase()}
      </span>
    );
  }

  const pillStyle: CSSProperties = {
    fontFamily,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1.4,
    color: colors.text,
    background: colors.bg,
    padding: "4px 12px",
    borderRadius: 999,
    whiteSpace: "nowrap",
    ...style,
  };
  const dotStyle: CSSProperties = {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: colors.dot,
    flexShrink: 0,
  };

  return (
    <span
      data-nozle="plan-badge"
      data-variant="pill"
      data-status={data.subscription_status}
      className={className}
      style={pillStyle}
      {...props}
    >
      <span style={dotStyle} aria-hidden="true" />
      {planName}
    </span>
  );
}
