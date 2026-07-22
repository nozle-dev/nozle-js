"use client";

import type React from "react";

import { creditUnitLabel, formatDecimalString } from "../../core/decimal.js";
import { useEntityCreditBalance } from "../../hooks/use-entity-credit-balance.js";

export interface EntityProductCreditBalanceProps {
  entityId: string;
  creditSystemCode: string;
  customerId?: string;
  maximumFractionDigits?: number;
  className?: string;
  style?: React.CSSProperties;
}

function policyLabel(policy: string | null): string {
  if (!policy) return "No active pool policy";
  return policy.replaceAll("_", " ");
}

export function EntityProductCreditBalance({
  entityId,
  creditSystemCode,
  customerId,
  maximumFractionDigits = 12,
  className,
  style,
}: EntityProductCreditBalanceProps) {
  const { data, isLoading, error } = useEntityCreditBalance(
    entityId,
    creditSystemCode,
    { customerId },
  );

  if (isLoading) {
    return (
      <div
        role="status"
        aria-label="Loading Entity product credit balance"
        className={className}
        style={{
          width: "12rem",
          height: "5rem",
          borderRadius: "0.375rem",
          background: "var(--nozle-border, var(--border, #e5e7eb))",
          ...style,
        }}
      />
    );
  }

  if (error || !data) {
    return (
      <span
        role="alert"
        className={className}
        style={{
          color: "var(--nozle-destructive, var(--destructive, #dc2626))",
          ...style,
        }}
      >
        Failed to load Entity product credit balance
      </span>
    );
  }

  return (
    <div className={className} style={style}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
        <span
          style={{
            fontSize: "1.5rem",
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatDecimalString(
            data.effective_available,
            maximumFractionDigits,
          )}
        </span>
        <span style={{ color: "var(--nozle-muted-foreground, #64748b)" }}>
          {creditUnitLabel(data.effective_available, data.unit_name)} available
        </span>
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          marginTop: "0.375rem",
          color: "var(--nozle-muted-foreground, #64748b)",
          fontSize: "0.875rem",
        }}
      >
        <span>
          Entity {formatDecimalString(data.entity_available, maximumFractionDigits)}
        </span>
        <span>
          Shared {formatDecimalString(data.shared_available, maximumFractionDigits)}
        </span>
        <span style={{ textTransform: "capitalize" }}>
          {policyLabel(data.pool_policy)}
        </span>
      </div>
    </div>
  );
}
