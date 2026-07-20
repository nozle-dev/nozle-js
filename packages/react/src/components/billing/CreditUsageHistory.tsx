"use client";

import type React from "react";

import { formatDecimalString } from "../../core/decimal.js";
import { useCreditOperations } from "../../hooks/use-credit-operations.js";
import type { CreditOperation } from "../../types.js";

export interface CreditUsageHistoryProps {
  customerId?: string;
  creditSystemCode?: string;
  pageSize?: number;
  maximumFractionDigits?: number;
  className?: string;
}

function operationLabel(operation: CreditOperation): string {
  if (operation.type === "consume") {
    if (operation.status === "denied")
      return operation.reason === "insufficient_credits"
        ? "Usage denied"
        : "Denied usage";
    return operation.billable_metric_code
      ? `Used for ${operation.billable_metric_code}`
      : "Credits used";
  }
  const labels: Record<string, string> = {
    grant: "Credits granted",
    adjustment: "Balance adjustment",
    expire: "Credits expired",
    revoke: "Credits revoked",
    refund: "Credits refunded",
  };
  return labels[operation.type] ?? operation.type;
}

function signedAmount(
  operation: CreditOperation,
  maximumFractionDigits: number,
): string {
  const amount = formatDecimalString(
    operation.credit_amount,
    maximumFractionDigits,
  );
  if (operation.status === "denied") return `${amount} required`;
  return operation.type === "consume" ||
    operation.type === "expire" ||
    operation.type === "revoke"
    ? `−${amount}`
    : `+${amount}`;
}

function rateSnapshot(operation: CreditOperation): string {
  if (!operation.rate_metric_amount || !operation.rate_credit_amount) return "";
  return ` · rate ${operation.rate_credit_amount} ${operation.unit_name} / ${operation.rate_metric_amount} metric units`;
}

function formatOperationDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function CreditUsageHistory({
  customerId,
  creditSystemCode,
  pageSize = 20,
  maximumFractionDigits = 12,
  className,
}: CreditUsageHistoryProps) {
  const { operations, isLoading, isLoadingMore, hasMore, error, loadMore } =
    useCreditOperations({
      customerId,
      creditSystemCode,
      pageSize,
    });

  if (isLoading) return <p role="status">Loading credit history…</p>;
  if (error && operations.length === 0)
    return <p role="alert">Failed to load credit history</p>;
  if (operations.length === 0)
    return <p className={className}>No credit activity yet.</p>;

  return (
    <div className={className}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr
            style={{ borderBottom: "1px solid var(--nozle-border, #e5e7eb)" }}
          >
            <th style={{ padding: "0.5rem", textAlign: "left" }}>Activity</th>
            <th style={{ padding: "0.5rem", textAlign: "left" }}>
              Credit system
            </th>
            <th style={{ padding: "0.5rem", textAlign: "right" }}>Amount</th>
            <th style={{ padding: "0.5rem", textAlign: "right" }}>Date</th>
          </tr>
        </thead>
        <tbody>
          {operations.map((operation) => (
            <tr
              key={operation.id}
              style={{ borderBottom: "1px solid var(--nozle-border, #e5e7eb)" }}
            >
              <td style={{ padding: "0.625rem 0.5rem" }}>
                <div>{operationLabel(operation)}</div>
                <div
                  style={{
                    color: "var(--nozle-muted-foreground, #64748b)",
                    fontSize: "0.75rem",
                  }}
                >
                  {operation.status}
                  {operation.metric_amount
                    ? ` · ${operation.metric_amount} metric units`
                    : ""}
                  {rateSnapshot(operation)}
                </div>
              </td>
              <td style={{ padding: "0.625rem 0.5rem" }}>
                {operation.credit_system_name}
              </td>
              <td
                style={{
                  padding: "0.625rem 0.5rem",
                  textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {signedAmount(operation, maximumFractionDigits)}{" "}
                {operation.unit_name}
              </td>
              <td style={{ padding: "0.625rem 0.5rem", textAlign: "right" }}>
                {formatOperationDate(operation.occurred_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error ? (
        <p role="alert">Could not load more credit history. Try again.</p>
      ) : null}
      {hasMore ? (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={isLoadingMore}
          style={{ marginTop: "0.75rem" }}
        >
          {isLoadingMore ? "Loading…" : "Load more"}
        </button>
      ) : null}
    </div>
  );
}
