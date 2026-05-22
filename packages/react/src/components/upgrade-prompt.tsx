import { useCan } from "../hooks/use-can";
import type { CSSProperties } from "react";
import type { UpgradePromptProps } from "./types";

const fontFamily =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const primaryColor = "#6366f1";
const primaryHover = "#4f46e5";

export function UpgradePrompt({
  feature,
  variant = "card",
  upgradeUrl = "/upgrade",
  message = "Upgrade your plan to unlock this feature",
  className,
  style,
  ...props
}: UpgradePromptProps) {
  const { allowed, isLoading } = useCan(feature ?? "");

  if (isLoading || allowed || !feature) return null;

  if (variant === "inline") {
    const inlineStyle: CSSProperties = {
      fontFamily,
      fontSize: 13,
      color: "#6b7280",
      ...style,
    };
    const linkStyle: CSSProperties = {
      color: primaryColor,
      fontWeight: 600,
      textDecoration: "none",
      marginLeft: 4,
    };
    return (
      <span
        data-nozle="upgrade-prompt"
        data-variant="inline"
        className={className}
        style={inlineStyle}
        {...props}
      >
        {message}
        <a
          href={upgradeUrl}
          data-nozle="upgrade-prompt-link"
          style={linkStyle}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.textDecoration = "underline";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.textDecoration = "none";
          }}
        >
          Upgrade
        </a>
      </span>
    );
  }

  if (variant === "banner") {
    const bannerStyle: CSSProperties = {
      fontFamily,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 16,
      background: "rgba(99, 102, 241, 0.06)",
      border: "1px solid rgba(99, 102, 241, 0.15)",
      borderRadius: 10,
      padding: "12px 20px",
      ...style,
    };
    const msgStyle: CSSProperties = {
      fontSize: 14,
      fontWeight: 500,
      color: "#374151",
      flex: 1,
    };
    const btnStyle: CSSProperties = {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 13,
      fontWeight: 600,
      color: "#ffffff",
      background: primaryColor,
      border: "none",
      borderRadius: 8,
      padding: "8px 18px",
      textDecoration: "none",
      cursor: "pointer",
      whiteSpace: "nowrap",
      transition: "background 0.15s ease",
    };
    return (
      <div
        data-nozle="upgrade-prompt"
        data-variant="banner"
        className={className}
        style={bannerStyle}
        {...props}
      >
        <span data-nozle="upgrade-prompt-message" style={msgStyle}>
          {message}
        </span>
        <a
          href={upgradeUrl}
          data-nozle="upgrade-prompt-action"
          style={btnStyle}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.background = primaryHover;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.background = primaryColor;
          }}
        >
          Upgrade
        </a>
      </div>
    );
  }

  const cardStyle: CSSProperties = {
    fontFamily,
    maxWidth: 400,
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    padding: 24,
    boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)",
    textAlign: "center",
    ...style,
  };

  const iconWrapStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 48,
    height: 48,
    borderRadius: 12,
    background: "rgba(99, 102, 241, 0.08)",
    marginBottom: 16,
  };

  const msgStyle: CSSProperties = {
    fontSize: 15,
    fontWeight: 500,
    color: "#374151",
    lineHeight: 1.5,
    margin: 0,
    marginBottom: 20,
  };

  const btnStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
    fontWeight: 600,
    color: "#ffffff",
    background: primaryColor,
    border: "none",
    borderRadius: 10,
    padding: "10px 24px",
    textDecoration: "none",
    cursor: "pointer",
    transition: "background 0.15s ease",
    width: "100%",
  };

  return (
    <div
      data-nozle="upgrade-prompt"
      data-variant="card"
      className={className}
      style={cardStyle}
      {...props}
    >
      <div data-nozle="upgrade-prompt-content">
        <div style={iconWrapStyle}>
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke={primaryColor}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
        </div>
        <p data-nozle="upgrade-prompt-message" style={msgStyle}>
          {message}
        </p>
      </div>
      <a
        href={upgradeUrl}
        data-nozle="upgrade-prompt-action"
        style={btnStyle}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.background = primaryHover;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.background = primaryColor;
        }}
      >
        Upgrade Now
      </a>
    </div>
  );
}
