"use client";

import type React from "react";

import { formatDecimalString } from "../../core/decimal.js";
import { useEntityCreditOperations } from "../../hooks/use-entity-credit-operations.js";
import type { CreditOperation } from "../../types.js";

export interface EntityCreditUsageHistoryProps {
  entityId: string;
  customerId?: string;
  creditSystemCode?: string;
  pageSize?: number;
  maximumFractionDigits?: number;
  className?: string;
}

function operationLabel(operation: CreditOperation): string {
  if (operation.type === "consume") {
    if (operation.status === "denied") return "Usage denied";
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
    transfer: "Credit transfer",
  };
  return labels[operation.type] ?? operation.type;
}

export function EntityCreditUsageHistory({
  entityId,
  customerId,
  creditSystemCode,
  pageSize = 20,
  maximumFractionDigits = 12,
  className,
}: EntityCreditUsageHistoryProps) {
  const { operations, isLoading, isLoadingMore, hasMore, error, loadMore } =
    useEntityCreditOperations(entityId, {
      customerId,
      creditSystemCode,
      pageSize,
    });

  if (isLoading) return <p role="status">Loading Entity credit history…</p>;
  if (error && operations.length === 0)
    return <p role="alert">Failed to load Entity credit history</p>;
  if (operations.length === 0)
    return <p className={className}>No Entity credit activity yet.</p>;

  return (
    <div className={className}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--nozle-border, #e5e7eb)" }}>
            <th style={{ padding: "0.5rem", textAlign: "left" }}>Activity</th>
            <th style={{ padding: "0.5rem", textAlign: "left" }}>Credit system</th>
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
                <small style={{ color: "var(--nozle-muted-foreground, #64748b)" }}>
                  {operation.status}
                </small>
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
                {formatDecimalString(
                  operation.credit_amount,
                  maximumFractionDigits,
                )}{" "}
                {operation.unit_name}
              </td>
              <td style={{ padding: "0.625rem 0.5rem", textAlign: "right" }}>
                {new Date(operation.occurred_at).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error ? <p role="alert">Could not load more Entity credit history.</p> : null}
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
