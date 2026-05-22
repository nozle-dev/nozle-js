import { useUsage } from "../hooks/use-usage";
import type { CSSProperties } from "react";
import type { UsageMeterProps } from "./types";

const fontFamily =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const levelColors: Record<string, { fg: string; bg: string; trackBg: string }> =
  {
    normal: {
      fg: "#6366f1",
      bg: "rgba(99, 102, 241, 0.08)",
      trackBg: "#e5e7eb",
    },
    warning: {
      fg: "#f59e0b",
      bg: "rgba(245, 158, 11, 0.08)",
      trackBg: "#e5e7eb",
    },
    critical: {
      fg: "#ef4444",
      bg: "rgba(239, 68, 68, 0.08)",
      trackBg: "#e5e7eb",
    },
  };

let skeletonStyleInjected = false;
function ensureKeyframes() {
  if (skeletonStyleInjected || typeof document === "undefined") return;
  const sheet = document.createElement("style");
  sheet.textContent = `@keyframes nozle-pulse{0%,100%{opacity:1}50%{opacity:.4}}`;
  document.head.appendChild(sheet);
  skeletonStyleInjected = true;
}

export function UsageMeter({
  metric,
  variant = "bar",
  className,
  style,
  ...props
}: UsageMeterProps) {
  const { data, isLoading, error } = useUsage(metric);

  if (isLoading) {
    ensureKeyframes();
    if (variant === "minimal") {
      return (
        <span
          data-nozle="usage-meter"
          data-variant="minimal"
          className={className}
          style={{
            display: "inline-block",
            width: 80,
            height: 16,
            borderRadius: 4,
            background: "#e5e7eb",
            animation: "nozle-pulse 1.5s ease-in-out infinite",
            ...style,
          }}
          {...props}
        />
      );
    }
    if (variant === "ring") {
      return (
        <div
          data-nozle="usage-meter"
          data-variant="ring"
          className={className}
          style={{
            width: 96,
            height: 96,
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
      <div
        data-nozle="usage-meter"
        data-variant="bar"
        className={className}
        style={{
          maxWidth: 360,
          fontFamily,
          ...style,
        }}
        {...props}
      >
        <div
          style={{
            height: 8,
            borderRadius: 4,
            background: "#e5e7eb",
            animation: "nozle-pulse 1.5s ease-in-out infinite",
          }}
        />
      </div>
    );
  }

  if (error || !data) return null;

  const percent =
    data.limit > 0 ? Math.round((data.used / data.limit) * 100) : 0;
  const level =
    percent >= 90 ? "critical" : percent >= 75 ? "warning" : "normal";
  const colors = levelColors[level];

  if (variant === "minimal") {
    const minimalStyle: CSSProperties = {
      fontFamily,
      fontSize: 13,
      fontWeight: 500,
      color: colors.fg,
      background: colors.bg,
      padding: "3px 8px",
      borderRadius: 6,
      whiteSpace: "nowrap",
      ...style,
    };
    return (
      <span
        data-nozle="usage-meter"
        data-variant="minimal"
        data-level={level}
        className={className}
        style={minimalStyle}
        {...props}
      >
        {data.used.toLocaleString()}/{data.limit.toLocaleString()}
      </span>
    );
  }

  if (variant === "ring") {
    const size = 96;
    const strokeWidth = 7;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percent / 100) * circumference;

    const containerStyle: CSSProperties = {
      position: "relative",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: size,
      height: size,
      fontFamily,
      ...style,
    };

    const labelStyle: CSSProperties = {
      position: "absolute",
      inset: 0,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      fontWeight: 700,
      fontSize: 20,
      lineHeight: 1,
      color: colors.fg,
    };

    return (
      <div
        data-nozle="usage-meter"
        data-variant="ring"
        data-level={level}
        className={className}
        style={containerStyle}
        {...props}
      >
        <svg
          viewBox={`0 0 ${size} ${size}`}
          width={size}
          height={size}
          style={{ display: "block", transform: "rotate(-90deg)" }}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={colors.trackBg}
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={colors.fg}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.4s ease" }}
          />
        </svg>
        <span data-nozle="usage-meter-label" style={labelStyle}>
          <span>{percent}%</span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 400,
              color: "#6b7280",
              marginTop: 2,
            }}
          >
            used
          </span>
        </span>
      </div>
    );
  }

  const cardStyle: CSSProperties = {
    fontFamily,
    maxWidth: 360,
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: "16px 20px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)",
    ...style,
  };

  const headerStyle: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 10,
  };

  const labelStyle: CSSProperties = {
    fontSize: 13,
    fontWeight: 500,
    color: "#374151",
  };

  const valueStyle: CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    color: colors.fg,
  };

  const trackStyle: CSSProperties = {
    height: 8,
    borderRadius: 4,
    background: colors.trackBg,
    overflow: "hidden",
  };

  const fillStyle: CSSProperties = {
    height: "100%",
    borderRadius: 4,
    background: colors.fg,
    width: `${Math.min(percent, 100)}%`,
    transition: "width 0.4s ease",
  };

  return (
    <div
      data-nozle="usage-meter"
      data-variant="bar"
      data-level={level}
      className={className}
      style={cardStyle}
      {...props}
    >
      <div style={headerStyle}>
        <span data-nozle="usage-meter-label" style={labelStyle}>
          {data.used.toLocaleString()} / {data.limit.toLocaleString()}
        </span>
        <span style={valueStyle}>{percent}%</span>
      </div>
      <div data-nozle="usage-meter-track" style={trackStyle}>
        <div data-nozle="usage-meter-fill" style={fillStyle} />
      </div>
    </div>
  );
}
