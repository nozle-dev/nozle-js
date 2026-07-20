/**
 * CreditTopUpButton — Creates checkout for one configured credit package.
 * Credits are granted only after Core confirms successful payment.
 */

"use client";

import React, { useRef, useState } from "react";

import { navigateToCheckout } from "./checkout-navigation.js";
import { useBillingPortal } from "./BillingPortalProvider.js";

export interface CreditTopUpPurchase {
  lago_id: string;
  payment_url?: string | null;
  payment_status: "pending" | "succeeded" | "failed" | "voided" | string;
  credit_amount: string;
  amount_cents: number;
  currency: string;
  package_code: string;
  replayed: boolean;
}

export interface CreditPurchaseCheckout {
  credit_top_up_purchase: CreditTopUpPurchase;
}

export interface CreditTopUpButtonProps {
  creditSystemCode: string;
  topUpPackageCode: string;
  packageName?: string;
  creditAmount?: string;
  priceLabel?: string;
  label?: string;
  apiBaseUrl?: string;
  className?: string;
  style?: React.CSSProperties;
  onCheckoutCreated?: (checkout: CreditPurchaseCheckout) => void;
  onError?: (error: Error) => void;
}

/**
 * Opens a confirmation dialog for a fixed Rails-managed top-up package.
 * Arbitrary dollar purchases through `/api/v1/credits/purchase` are deprecated;
 * integrations must provide the catalog package identifiers.
 */
export function CreditTopUpButton({
  creditSystemCode,
  topUpPackageCode,
  packageName = topUpPackageCode,
  creditAmount,
  priceLabel,
  label = "Add Credits",
  apiBaseUrl,
  className,
  style,
  onCheckoutCreated,
  onError,
}: CreditTopUpButtonProps): React.ReactElement {
  const portal = useBillingPortal();
  const { customerId, apiKey } = portal;
  const baseUrl = apiBaseUrl ?? portal.apiBaseUrl;
  const idempotencyKeyRef = useRef<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePurchase(): Promise<void> {
    if (loading) return;

    setLoading(true);
    setError(null);
    const idempotencyKey =
      idempotencyKeyRef.current ??
      globalThis.crypto?.randomUUID?.() ??
      `${customerId}-${topUpPackageCode}-${Date.now().toString(36)}`;
    idempotencyKeyRef.current = idempotencyKey;

    try {
      const response = await fetch(`${baseUrl}/api/v1/credit-top-up-purchases`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          customer_id: customerId,
          credit_system_code: creditSystemCode,
          top_up_package_code: topUpPackageCode,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Credit purchase failed`);
      }

      const checkout = (await response.json()) as CreditPurchaseCheckout;
      const purchase = checkout.credit_top_up_purchase;
      if (!purchase?.lago_id) {
        throw new Error("Credit purchase checkout returned no purchase");
      }

      onCheckoutCreated?.(checkout);

      if (purchase.payment_url) {
        navigateToCheckout(purchase.payment_url);
        idempotencyKeyRef.current = null;
      } else if (purchase.payment_status === "succeeded") {
        idempotencyKeyRef.current = null;
        setIsOpen(false);
      } else {
        throw new Error("Credit purchase checkout is waiting for tax or payment setup");
      }
    } catch (err: unknown) {
      const purchaseError =
        err instanceof Error ? err : new Error("Credit purchase failed");
      setError(purchaseError.message);
      onError?.(purchaseError);
    } finally {
      setLoading(false);
    }
  }

  const overlayStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "oklch(0 0 0 / 0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  };

  const dialogStyle: React.CSSProperties = {
    background: "var(--nozle-background, var(--background))",
    color: "var(--nozle-foreground, var(--foreground))",
    border: "1px solid var(--nozle-border, var(--border))",
    borderRadius: "var(--nozle-radius, 0.5rem)",
    padding: "2rem",
    maxWidth: "24rem",
    width: "100%",
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={className}
        style={{
          padding: "0.75rem 1.5rem",
          borderRadius: "var(--nozle-radius, 0.5rem)",
          border: "none",
          background: "var(--nozle-primary, var(--primary))",
          color: "var(--nozle-primary-foreground, var(--primary-foreground))",
          cursor: "pointer",
          fontWeight: 500,
          ...style,
        }}
      >
        {label}
      </button>

      {isOpen && (
        <div
          style={overlayStyle}
          role="dialog"
          aria-modal="true"
          aria-label="Add credits"
        >
          <div style={dialogStyle}>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 600, margin: "0 0 1rem" }}>
              {packageName}
            </h2>
            {(creditAmount || priceLabel) && (
              <p
                style={{
                  color: "var(--nozle-muted-foreground, var(--muted-foreground))",
                  fontSize: "0.875rem",
                  margin: "0 0 1.25rem",
                }}
              >
                {[creditAmount && `${creditAmount} credits`, priceLabel]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
            <p
              style={{
                color: "var(--nozle-muted-foreground, var(--muted-foreground))",
                fontSize: "0.875rem",
                margin: "0 0 1.25rem",
              }}
            >
              Checkout does not grant credits. Credits are added only after payment succeeds.
            </p>

            {error && (
              <p style={{ color: "oklch(0.6 0.2 25)", marginBottom: "1rem", fontSize: "0.875rem" }}>
                {error}
              </p>
            )}

            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button
                onClick={() => setIsOpen(false)}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "var(--nozle-radius, 0.5rem)",
                  border: "1px solid var(--nozle-border, var(--border))",
                  background: "transparent",
                  color: "var(--nozle-foreground, var(--foreground))",
                  cursor: "pointer",
                }}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                onClick={() => void handlePurchase()}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "var(--nozle-radius, 0.5rem)",
                  border: "none",
                  background: "var(--nozle-primary, var(--primary))",
                  color: "var(--nozle-primary-foreground, var(--primary-foreground))",
                  cursor: loading ? "not-allowed" : "pointer",
                  fontWeight: 500,
                  opacity: loading ? 0.7 : 1,
                }}
                disabled={loading}
              >
                {loading ? "Creating checkout..." : `Buy ${packageName}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
