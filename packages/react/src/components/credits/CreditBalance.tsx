"use client";

import React from "react";
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
}

const SOURCE_LABELS: Record<CreditBalanceSource["type"], string> = {
  subscription_grant: "Plan grant",
  top_up: "Top-up",
  manual_grant: "Granted",
  adjustment: "Adjustment",
  allocated_top_up: "Allocated top-up",
};

const text = "var(--nozle-foreground, var(--foreground))";
const muted = "var(--nozle-muted-foreground, var(--muted-foreground))";

function date(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("en-US", { dateStyle: "medium" });
}

export function CreditBalance({
  balance,
  isLoading = false,
  error = null,
  emptyMessage = "No credit balance yet.",
}: CreditBalanceProps): React.ReactElement {
  if (isLoading) return <div role="status" aria-label="Loading credit balance" style={{ height: 96, borderRadius: 8, background: "var(--nozle-border, var(--border))" }} />;
  if (error) return <p role="alert">{typeof error === "string" ? error : error.message}</p>;
  if (!balance) return <p role="status">{emptyMessage}</p>;

  const sources = (balance.sources ?? []).filter((source) => source.remaining !== "0");

  return (
    <section aria-label={balance.credit_system_name} style={{ color: text }}>
      <h3 style={{ margin: 0, fontSize: "0.875rem", fontWeight: 500, color: muted }}>{balance.credit_system_name}</h3>
      <p style={{ margin: "0.25rem 0 0" }}>
        <span style={{ fontSize: "2rem", fontWeight: 700 }}>{formatDecimalString(balance.available)}</span>{" "}
        <span style={{ color: muted }}>{creditUnitLabel(balance.available, balance.unit_name)} available</span>
      </p>
      <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem", color: muted }}>As of {date(balance.as_of)}</p>
      {sources.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: "1rem 0 0", fontSize: "0.875rem" }}>
          {sources.map((source) => (
            <li key={source.id} style={{ display: "flex", justifyContent: "space-between", padding: "0.25rem 0" }}>
              <span>{SOURCE_LABELS[source.type] ?? source.type}</span>
              <span style={{ color: muted }}>
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
