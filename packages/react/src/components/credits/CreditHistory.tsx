"use client";

import React from "react";
import { useAppearance } from "../../appearance/context.js";
import { T, border as themeBorder, surface, type Appearance } from "../../appearance/tokens.js";
import { formatDecimalString } from "../../core/decimal.js";

/** The fields of the SDK's credit operation (`nozle.credits.operations`) that this component reads. */
export interface CreditOperationData {
  id: string;
  type: "consume" | "grant" | "adjustment" | "expire" | "revoke" | "refund" | "transfer";
  status: "succeeded" | "denied" | "reversed";
  credit_amount: string;
  feature_code: string | null;
  occurred_at: string;
}

export interface CreditHistoryProps {
  operations?: CreditOperationData[];
  isLoading?: boolean;
  error?: Error | string | null;
  emptyMessage?: string;
  /** When true a "Load more" button is shown. Fetch the next page with the SDK's `next_cursor`. */
  hasMore?: boolean;
  onLoadMore?: () => void;
  appearance?: Appearance;
}

const TYPE_LABELS: Record<CreditOperationData["type"], string> = {
  consume: "Used",
  grant: "Granted",
  adjustment: "Adjustment",
  expire: "Expired",
  revoke: "Revoked",
  refund: "Refunded",
  transfer: "Transfer",
};

const muted = T.mutedForeground;
const cell = { padding: "0.5rem 0.75rem", borderBottom: themeBorder(), textAlign: "left" as const };

function when(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

export function CreditHistory({
  operations = [],
  isLoading = false,
  error = null,
  emptyMessage = "No credit activity yet.",
  hasMore = false,
  onLoadMore,
  appearance,
}: CreditHistoryProps): React.ReactElement {
  const { root, el } = useAppearance(appearance);
  if (error) return <p {...root("creditHistory", { ...surface, color: T.danger })} role="alert">{typeof error === "string" ? error : error.message}</p>;
  if (isLoading && operations.length === 0) return <div {...root("creditHistory", { ...surface, height: 120, background: T.skeleton })} role="status" aria-label="Loading credit history" />;
  if (operations.length === 0) return <p {...root("creditHistory", { ...surface, color: muted })} role="status">{emptyMessage}</p>;

  return (
    <div {...root("creditHistory", { ...surface, overflowX: "auto" })}>
      <table {...el("creditHistory__table", { width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" })}>
        <thead>
          <tr>
            {["When", "Type", "Feature", "Credits", "Status"].map((heading) => (
              <th key={heading} style={{ ...cell, color: muted, fontWeight: 500 }}>{heading}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {operations.map((operation) => (
            <tr key={operation.id} {...el("creditHistory__row")}>
              <td style={cell}>{when(operation.occurred_at)}</td>
              <td style={cell}>{TYPE_LABELS[operation.type] ?? operation.type}</td>
              <td style={cell}>{operation.feature_code ?? "—"}</td>
              <td style={cell}>{formatDecimalString(operation.credit_amount)}</td>
              <td style={{ ...cell, color: operation.status === "succeeded" ? undefined : muted }}>{operation.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {hasMore && onLoadMore && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={isLoading}
          style={{
            marginTop: "0.75rem",
            padding: "0.5rem 0.875rem",
            font: "inherit",
            color: T.foreground,
            background: T.muted,
            border: themeBorder(),
            borderRadius: `calc(${T.radius} / 2)`,
            cursor: isLoading ? "wait" : "pointer",
          }}
        >
          {isLoading ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
