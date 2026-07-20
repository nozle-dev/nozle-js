"use client";

import type React from "react";

import { creditUnitLabel, formatDecimalString } from "../../core/decimal.js";
import { useCreditBalance } from "../../hooks/use-credit-balance.js";

export interface CreditBalanceProps {
  creditSystemCode: string;
  customerId?: string;
  maximumFractionDigits?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function CreditBalance({
  creditSystemCode,
  customerId,
  maximumFractionDigits = 12,
  className,
  style,
}: CreditBalanceProps) {
  const { data, isLoading, error } = useCreditBalance(creditSystemCode, {
    customerId,
  });

  if (isLoading) {
    return (
      <div
        role="status"
        aria-label="Loading credit balance"
        className={className}
        style={{
          width: "8rem",
          height: "2rem",
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
        Failed to load credit balance
      </span>
    );
  }

  const amount = formatDecimalString(data.available, maximumFractionDigits);
  return (
    <div
      className={className}
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: "0.5rem",
        ...style,
      }}
    >
      <span
        style={{
          fontSize: "1.5rem",
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {amount}
      </span>
      <span
        style={{
          color:
            "var(--nozle-muted-foreground, var(--muted-foreground, #64748b))",
        }}
      >
        {creditUnitLabel(data.available, data.unit_name)}
      </span>
    </div>
  );
}
