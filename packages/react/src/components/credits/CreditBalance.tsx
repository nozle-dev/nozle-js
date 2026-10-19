"use client";

import React from "react";
import { useAppearance } from "../../appearance/context.js";
import { T, border as themeBorder, surface, text, type Appearance } from "../../appearance/tokens.js";
import { creditUnitLabel, formatDecimalString } from "../../core/decimal.js";

export interface CreditBalanceSource {
  id: string;
  type: "subscription_grant" | "top_up" | "manual_grant" | "adjustment" | "allocated_top_up";
  remaining: string;
  expires_at: string | null;
}

/** The fields of the SDK's credit balance (`nozle.credits.balance`) that this component reads. */
export interface CreditBalanceData {
  credit_system_name: string;
  unit_name: string;
  available: string;
  as_of: string;
  sources?: CreditBalanceSource[];
}

export interface CreditBalanceProps {
  /** One balance from your backend. `null` or `undefined` shows the empty message. */
  balance?: CreditBalanceData | null;
  isLoading?: boolean;
  error?: Error | string | null;
  emptyMessage?: string;
  appearance?: Appearance;
}

const SOURCE_LABELS: Record<CreditBalanceSource["type"], string> = {
  subscription_grant: "Plan grant",
  top_up: "Top-up",
  manual_grant: "Granted",
  adjustment: "Adjustment",
  allocated_top_up: "Allocated top-up",
};

const muted = T.mutedForeground;

function date(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("en-US", { dateStyle: "medium" });
}

export function CreditBalance({
  balance,
  isLoading = false,
  error = null,
  emptyMessage = "No credit balance yet.",
  appearance,
}: CreditBalanceProps): React.ReactElement {
  const { root, el } = useAppearance(appearance, 'CreditBalance');
  if (isLoading) return <div {...root("creditBalance", { ...surface, height: 96, background: T.skeleton })} role="status" aria-label="Loading credit balance" />;
  if (error) return <p {...root("creditBalance", { ...surface, color: T.dangerText })} role="alert">{typeof error === "string" ? error : error.message}</p>;
  if (!balance) return <p {...root("creditBalance", { ...surface, color: muted })} role="status">{emptyMessage}</p>;

  const sources = (balance.sources ?? []).filter((source) => source.remaining !== "0");

  return (
    <section aria-label={balance.credit_system_name} {...root("creditBalance", surface)}>
      <h3 style={{ ...text.heading, margin: 0 }}>{balance.credit_system_name}</h3>
      <p style={{ margin: "0.25rem 0 0" }}>
        <span {...el("creditBalance__amount", text.metric)}>{formatDecimalString(balance.available)}</span>{" "}
        <span style={text.secondary}>{creditUnitLabel(balance.available, balance.unit_name)} available</span>
      </p>
      <p style={{ ...text.meta, margin: "0.25rem 0 0" }}>As of {date(balance.as_of)}</p>
      {sources.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: "1rem 0 0" }}>
          {sources.map((source) => (
            <li key={source.id} style={{ display: "flex", justifyContent: "space-between", padding: "0.25rem 0" }}>
              <span>{SOURCE_LABELS[source.type] ?? source.type}</span>
              <span style={text.secondary}>
                {formatDecimalString(source.remaining)}
                {source.expires_at ? ` · expires ${date(source.expires_at)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
