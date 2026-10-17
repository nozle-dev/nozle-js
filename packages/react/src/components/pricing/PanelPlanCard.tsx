import React, { type CSSProperties, type ReactNode } from "react";
import type { ElementProps, UseAppearance } from "../../appearance/context.js";
import { T, border } from "../../appearance/tokens.js";

export interface PanelPlanCardProps {
  /** Props for the card element: `el` or `root` of the calling component. */
  frame: (style: CSSProperties) => ElementProps;
  el: UseAppearance["el"];
  name: string;
  description?: string;
  /** Formatted price, or a word such as "Custom". */
  price: string;
  /** "month", "year"…; omitted for a price without an interval. */
  interval?: string;
  features: string[];
  isCurrent: boolean;
  isHighlighted: boolean;
  /** The highlighted card takes the highlight colour as its fill instead of its border. */
  filled: boolean;
  /** Shown on the right of the header of a highlighted card that is not the current plan. */
  highlightLabel?: string | null;
  children?: ReactNode;
}

/**
 * The `panel` plan card layout: the name in a header band with the plan's status on the right,
 * then price, description, plain feature lines and the action.
 */
export function PanelPlanCard({
  frame,
  el,
  name,
  description,
  price,
  interval,
  features,
  isCurrent,
  isHighlighted,
  filled: filledStyle,
  highlightLabel,
  children,
}: PanelPlanCardProps): React.ReactElement {
  const filled = isHighlighted && filledStyle;
  const text = filled ? T.highlightForeground : T.foreground;
  const muted = filled ? `color-mix(in srgb, ${T.highlightForeground} 75%, ${T.highlight})` : T.mutedForeground;
  const edge = isHighlighted ? T.highlight : isCurrent ? T.foreground : T.border;
  const label = isCurrent ? "Active" : isHighlighted ? highlightLabel : null;

  return (
    <div
      {...frame({
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: filled ? T.highlight : T.card,
        color: text,
        fontFamily: T.font,
        border: border(edge),
        borderRadius: T.radius,
        boxShadow: T.shadow,
      })}
    >
      <div
        {...el("planCard__header", {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
          padding: "0.875rem 1.25rem",
          borderBottom: border(filled ? `color-mix(in srgb, ${T.highlightForeground} 30%, ${T.highlight})` : T.border),
        })}
      >
        <h3 {...el("planCard__name", { margin: 0, fontSize: "14px", fontWeight: 900, lineHeight: 1.25, letterSpacing: "-0.015em" })}>
          {name}
        </h3>
        {label && (
          <span
            {...el("planCard__badge", {
              fontFamily: T.fontMono,
              fontSize: "10.5px",
              fontWeight: 800,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
              color: filled ? text : isCurrent ? T.primary : T.highlight,
            })}
          >
            {label}
          </span>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem", padding: "1.25rem", flex: 1 }}>
        <div>
          <p {...el("planCard__price", { margin: 0, fontSize: "24px", fontWeight: 800, lineHeight: 1.2, fontVariantNumeric: "tabular-nums" })}>
            {price}
            {interval && <span style={{ fontSize: "12px", fontWeight: 400, color: muted }}> / {interval}</span>}
          </p>
          {description && (
            <p {...el("planCard__description", { margin: "0.25rem 0 0", fontSize: "14px", lineHeight: 1.5, color: muted })}>
              {description}
            </p>
          )}
        </div>

        <ul
          {...el("planCard__features", {
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: "0.375rem",
            flex: 1,
            fontSize: "14px",
            lineHeight: 1.5,
            color: muted,
          })}
        >
          {features.map((feature) => (
            <li key={feature} {...el("planCard__feature")}>
              {feature}
            </li>
          ))}
        </ul>

        {children}
      </div>
    </div>
  );
}
