"use client";

/**
 * CreditBalance — displays the current credit balance for a customer.
 * Uses the useCredits hook with customerId prop.
 */

import { useCredits } from "../../use-credits.js";

export interface CreditBalanceProps {
  customerId: string;
  currency?: string;
}

export function CreditBalance({
  customerId,
  currency = "USD",
}: CreditBalanceProps) {
  const { balance, loading, error } = useCredits(customerId);

  if (loading) {
    return (
      <div
        className="animate-pulse h-8 w-24 rounded"
        style={{ background: "var(--nozle-border, var(--border))" }}
      />
    );
  }

  if (error) {
    return (
      <span
        style={{ color: "var(--nozle-destructive, var(--destructive))" }}
        className="text-sm"
      >
        Failed to load balance
      </span>
    );
  }

  const amount = balance ?? 0;

  return (
    <div className="flex items-center gap-2">
      <span aria-label="wallet icon" style={{ fontSize: "1.25rem" }} role="img">
        &#x1F4B3;
      </span>
      {amount === 0 ? (
        <span
          style={{
            color: "var(--nozle-muted-foreground, var(--muted-foreground))",
          }}
          className="text-sm"
        >
          No credits
        </span>
      ) : (
        <span className="font-semibold">
          {new Intl.NumberFormat("en-US", {
            style: "currency",
            currency,
            minimumFractionDigits: 2,
          }).format(amount)}
        </span>
      )}
    </div>
  );
}
