"use client";

import type React from "react";

import { creditUnitLabel, formatDecimalString } from "../../core/decimal.js";
import { useCreditBalance } from "../../hooks/use-credit-balance.js";

export interface CreditBreakdownProps {
  creditSystemCode: string;
  customerId?: string;
  showUnavailable?: boolean;
  maximumFractionDigits?: number;
  className?: string;
}

const sourceLabels: Record<string, string> = {
  subscription_grant: "Plan grant",
  top_up: "Purchased top-up",
  manual_grant: "Manual grant",
  adjustment: "Adjustment",
};

function formatExpiry(value: string | null): string {
  if (!value) return "Does not expire";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `Expires ${date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}`;
}

export function CreditBreakdown({
  creditSystemCode,
  customerId,
  showUnavailable = true,
  maximumFractionDigits = 12,
  className,
}: CreditBreakdownProps) {
  const { data, isLoading, error } = useCreditBalance(creditSystemCode, {
    customerId,
  });
  if (isLoading) return <p role="status">Loading credit sources…</p>;
  if (error || !data) return <p role="alert">Failed to load credit sources</p>;

  const sources = showUnavailable
    ? data.sources
    : data.sources.filter((source) => source.available);
  if (sources.length === 0) {
    return <p className={className}>No credit sources yet.</p>;
  }

  return (
    <ul
      className={className}
      style={{
        display: "grid",
        gap: "0.75rem",
        listStyle: "none",
        margin: 0,
        padding: 0,
      }}
    >
      {sources.map((source) => (
        <li
          key={source.id}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "1rem",
            padding: "0.875rem",
            border: "1px solid var(--nozle-border, var(--border, #e5e7eb))",
            borderRadius: "var(--nozle-radius, 0.5rem)",
            opacity: source.available ? 1 : 0.65,
          }}
        >
          <div>
            <div style={{ fontWeight: 600 }}>
              {sourceLabels[source.type] ?? source.type}
            </div>
            <div
              style={{
                color: "var(--nozle-muted-foreground, #64748b)",
                fontSize: "0.8125rem",
              }}
            >
              {formatExpiry(source.expires_at)}
              {!source.available ? ` · ${source.status}` : ""}
            </div>
          </div>
          <div
            style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}
          >
            <strong>
              {formatDecimalString(source.remaining, maximumFractionDigits)}
            </strong>
            <div
              style={{
                color: "var(--nozle-muted-foreground, #64748b)",
                fontSize: "0.8125rem",
              }}
            >
              of {formatDecimalString(source.initial, maximumFractionDigits)}{" "}
              {creditUnitLabel(source.initial, data.unit_name)}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
