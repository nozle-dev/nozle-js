"use client";

import React from "react";
import { formatDecimalString } from "../../core/decimal.js";
import { formatAmount, formatDay, type CustomerUsageData } from "./usage-data.js";

export interface UsageBreakdownProps {
  /** The `customer_usage` object from Core's `current_usage`, read on your backend. */
  usage?: CustomerUsageData | null;
  isLoading?: boolean;
  error?: Error | string | null;
  emptyMessage?: string;
}

const border = "1px solid var(--nozle-border, var(--border))";
const muted = "var(--nozle-muted-foreground, var(--muted-foreground))";
const cell = { padding: "0.5rem 0.75rem", borderBottom: border };

export function UsageBreakdown({
  usage,
  isLoading = false,
  error = null,
  emptyMessage = "No usage in this period yet.",
}: UsageBreakdownProps): React.ReactElement {
  if (isLoading) return <div role="status" aria-label="Loading usage" style={{ height: 120, borderRadius: 8, background: "var(--nozle-border, var(--border))" }} />;
  if (error) return <p role="alert">{typeof error === "string" ? error : error.message}</p>;
  if (!usage || usage.charges_usage.length === 0) return <p role="status">{emptyMessage}</p>;

  const rows = [...usage.charges_usage].sort((a, b) => b.amount_cents - a.amount_cents);

  return (
    <section style={{ color: "var(--nozle-foreground, var(--foreground))" }}>
      <p style={{ margin: "0 0 0.5rem", fontSize: "0.875rem", color: muted }}>
        {formatDay(usage.from_datetime)} to {formatDay(usage.to_datetime)}
      </p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
          <thead>
            <tr>
              <th style={{ ...cell, textAlign: "left", color: muted, fontWeight: 500 }}>Feature</th>
              <th style={{ ...cell, textAlign: "right", color: muted, fontWeight: 500 }}>Units</th>
              <th style={{ ...cell, textAlign: "right", color: muted, fontWeight: 500 }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.charge.nozle_id}>
                <td style={cell}>{row.charge.invoice_display_name || row.feature.name}</td>
                <td style={{ ...cell, textAlign: "right" }}>{formatDecimalString(row.units, 6)}</td>
                <td style={{ ...cell, textAlign: "right" }}>{formatAmount(row.amount_cents, row.amount_currency)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td style={{ ...cell, fontWeight: 600 }} colSpan={2}>Total</td>
              <td style={{ ...cell, fontWeight: 600, textAlign: "right" }}>{formatAmount(usage.amount_cents, usage.currency)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
