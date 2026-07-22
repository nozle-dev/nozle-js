"use client";

import type React from "react";

import { formatDecimalString } from "../../core/decimal.js";
import { useEntityCreditBalance } from "../../hooks/use-entity-credit-balance.js";

export interface EntityCreditBreakdownProps {
  entityId: string;
  creditSystemCode: string;
  customerId?: string;
  maximumFractionDigits?: number;
  className?: string;
}

function sourceLabel(type: string): string {
  const labels: Record<string, string> = {
    subscription_grant: "Plan grant",
    allocated_top_up: "Allocated top-up",
    top_up: "Shared top-up",
    manual_grant: "Manual grant",
    adjustment: "Adjustment",
  };
  return labels[type] ?? type;
}

export function EntityCreditBreakdown({
  entityId,
  creditSystemCode,
  customerId,
  maximumFractionDigits = 12,
  className,
}: EntityCreditBreakdownProps) {
  const { data, isLoading, error } = useEntityCreditBalance(
    entityId,
    creditSystemCode,
    { customerId },
  );

  if (isLoading) return <p role="status">Loading Entity credit sources…</p>;
  if (error || !data)
    return <p role="alert">Failed to load Entity credit sources</p>;
  if (data.sources.length === 0)
    return <p className={className}>No active or scheduled credit sources.</p>;

  return (
    <div className={className}>
      {data.sources.map((source) => (
        <div
          key={source.id}
          style={{
            borderBottom: "1px solid var(--nozle-border, #e5e7eb)",
            padding: "0.625rem 0",
          }}
        >
          <div
            style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}
          >
            <strong>{sourceLabel(source.type)}</strong>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {formatDecimalString(source.remaining, maximumFractionDigits)} {data.unit_name}
            </span>
          </div>
          <div
            style={{
              color: "var(--nozle-muted-foreground, #64748b)",
              fontSize: "0.75rem",
              marginTop: "0.25rem",
            }}
          >
            {source.scope === "customer" ? "Shared company pool" : "Entity pool"}
            {source.parent_source_id ? ` · parent ${source.parent_source_id}` : ""}
            {source.expires_at
              ? ` · expires ${new Date(source.expires_at).toLocaleString()}`
              : " · no expiry"}
            {!source.available ? " · scheduled" : ""}
          </div>
        </div>
      ))}
    </div>
  );
}
