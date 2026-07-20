"use client";

import type React from "react";

import {
  compareDecimalStrings,
  creditUnitLabel,
  formatDecimalString,
} from "../../core/decimal.js";
import { useCreditBalance } from "../../hooks/use-credit-balance.js";

export interface LowCreditWarningProps {
  creditSystemCode: string;
  threshold: string;
  customerId?: string;
  message?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function LowCreditWarning({
  creditSystemCode,
  threshold,
  customerId,
  message,
  className,
  style,
}: LowCreditWarningProps) {
  const { data, isLoading, error } = useCreditBalance(creditSystemCode, {
    customerId,
  });
  if (isLoading || error || !data) return null;

  let low = false;
  try {
    low = compareDecimalStrings(data.available, threshold) <= 0;
  } catch {
    return null;
  }
  if (!low) return null;

  return (
    <div
      role="alert"
      className={className}
      style={{
        padding: "0.75rem 1rem",
        borderRadius: "var(--nozle-radius, 0.5rem)",
        background: "var(--nozle-warning-bg, #fef3c7)",
        color: "var(--nozle-warning-foreground, #92400e)",
        ...style,
      }}
    >
      {message ??
        `Low balance: ${formatDecimalString(data.available)} ${creditUnitLabel(data.available, data.unit_name)} remaining.`}
    </div>
  );
}
