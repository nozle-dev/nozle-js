import React, { type CSSProperties, type ReactNode } from "react";
import type { ElementProps, UseAppearance } from "../../appearance/context.js";
import { T, border, text as role } from "../../appearance/tokens.js";

export interface PanelPlanCardProps {
  /** Props for the card element: `el` or `root` of the calling component. */
  frame: (style: CSSProperties) => ElementProps;
  el: UseAppearance["el"];
  name: string;
  description?: string | null;
  /** Formatted price, or a word such as "Custom". */
  price: string;
  /** "month", "year"…; omitted for a price without an interval. */
  interval?: string;
  /** A line under the price, for example "Billed $490 yearly · save 17%". */
  priceNote?: string | null;
  /** Feature lines; an object adds a muted description under its label. */
  features: Array<string | { label: string; description?: string | null }>;
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
  priceNote,
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
        ...role.body,
        background: filled ? T.highlight : T.card,
        color: text,
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
        <h3 {...el("planCard__name", { ...role.heading, color: text, margin: 0 })}>
          {name}
        </h3>
        {label && (
          <span
            {...el("planCard__badge", {
              ...role.label,
              whiteSpace: "nowrap",
              // The current plan's label takes the colour of its button.
              color: filled ? text : isCurrent ? T.primary : T.highlight,
            })}
          >
            {label}
          </span>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem", padding: "1.25rem", flex: 1 }}>
        <div>
          <p {...el("planCard__price", { ...role.metric, color: text, margin: 0 })}>
            {price}
            {interval && <span style={{ ...role.meta, color: muted }}> / {interval}</span>}
          </p>
          {priceNote && (
            <p data-testid="pricing-billing" style={{ ...role.meta, color: muted, margin: "0.25rem 0 0" }}>
              {priceNote}
            </p>
          )}
          {description && (
            <p {...el("planCard__description", { ...role.secondary, color: muted, margin: "0.25rem 0 0" })}>
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
            ...role.secondary,
            color: muted,
          })}
        >
          {features.map((feature, index) => {
            const item = typeof feature === "string" ? { label: feature } : feature;
            return (
              <li key={`${index}:${item.label}`} {...el("planCard__feature")}>
                {item.label}
                {item.description && (
                  <span style={{ display: "block", ...role.meta, color: muted }}>{item.description}</span>
                )}
              </li>
            );
          })}
        </ul>

        {children}
      </div>
    </div>
  );
}
