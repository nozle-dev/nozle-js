/**
 * CreditTopUpButton — Opens a dialog for purchasing credits.
 * UI-02: Allows customers to top up their credit balance.
 * Uses CSS variable theming with --nozle-* namespace.
 */

"use client";
import React from "react";

import { useState } from "react";
import { useBillingPortal } from "./BillingPortalProvider.js";

const PRESET_AMOUNTS = [5, 10, 25, 50, 100];

export interface CreditPurchaseCheckout {
  type: "stripe";
  url?: string;
  client_secret?: string;
  clientSecret?: string;
  amount_dollars: number;
  credits: number;
}

export interface CreditTopUpButtonProps {
  label?: string;
  apiBaseUrl?: string;
  className?: string;
  style?: React.CSSProperties;
  minimumAmount?: number;
  creditsPerDollar?: number;
  onCheckoutCreated?: (checkout: CreditPurchaseCheckout) => void;
  onStripeClientSecret?: (clientSecret: string) => void;
  onError?: (error: Error) => void;
}

/**
 * CreditTopUpButton opens a dialog to purchase credits.
 * Must be used inside a BillingPortalProvider.
 */
export function CreditTopUpButton({
  label = "Add Credits",
  apiBaseUrl,
  className,
  style,
  minimumAmount = 5,
  creditsPerDollar = 25,
  onCheckoutCreated,
  onStripeClientSecret,
  onError,
}: CreditTopUpButtonProps): React.ReactElement {
  const portal = useBillingPortal();
  const { customerId, apiKey } = portal;
  const baseUrl = apiBaseUrl ?? portal.apiBaseUrl;
  const [isOpen, setIsOpen] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState<number>(10);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [useCustom, setUseCustom] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finalAmount = useCustom
    ? parseFloat(customAmount) || 0
    : selectedAmount;

  async function handlePurchase(): Promise<void> {
    if (finalAmount < minimumAmount) {
      setError(`Minimum purchase is $${minimumAmount}`);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${baseUrl}/api/v1/credits/purchase`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          customer_id: customerId,
          amount_dollars: finalAmount,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Credit purchase failed`);
      }

      const checkout = (await response.json()) as CreditPurchaseCheckout;
      const clientSecret = checkout.client_secret ?? checkout.clientSecret;
      if (!checkout.url && !clientSecret) {
        throw new Error("Credit purchase checkout returned no payment session");
      }

      onCheckoutCreated?.(checkout);

      if (checkout.url) {
        window.location.href = checkout.url;
      } else if (clientSecret && onStripeClientSecret) {
        onStripeClientSecret(clientSecret);
      } else {
        throw new Error(
          "onStripeClientSecret is required for embedded Stripe checkout",
        );
      }

      setIsOpen(false);
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
            <h2
              style={{
                fontSize: "1.25rem",
                fontWeight: 600,
                margin: "0 0 1.25rem",
              }}
            >
              Add Credits
            </h2>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.5rem",
                marginBottom: "1rem",
              }}
            >
              {PRESET_AMOUNTS.map((amount) => (
                <button
                  key={amount}
                  onClick={() => {
                    setUseCustom(false);
                    setSelectedAmount(amount);
                  }}
                  style={{
                    padding: "0.5rem 1rem",
                    borderRadius: "var(--nozle-radius, 0.5rem)",
                    border: "1px solid var(--nozle-border, var(--border))",
                    background:
                      !useCustom && selectedAmount === amount
                        ? "var(--nozle-primary, var(--primary))"
                        : "transparent",
                    color:
                      !useCustom && selectedAmount === amount
                        ? "var(--nozle-primary-foreground, var(--primary-foreground))"
                        : "var(--nozle-foreground, var(--foreground))",
                    cursor: "pointer",
                  }}
                  aria-pressed={!useCustom && selectedAmount === amount}
                >
                  ${amount}
                </button>
              ))}
            </div>

            <div style={{ marginBottom: "1.25rem" }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginBottom: "0.5rem",
                  fontSize: "0.875rem",
                  color:
                    "var(--nozle-muted-foreground, var(--muted-foreground))",
                }}
              >
                <input
                  type="checkbox"
                  checked={useCustom}
                  onChange={(e) => setUseCustom(e.target.checked)}
                />
                Custom amount
              </label>
              {useCustom && (
                <input
                  type="number"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  placeholder="Enter amount"
                  min={minimumAmount}
                  style={{
                    width: "100%",
                    padding: "0.5rem 0.75rem",
                    borderRadius: "var(--nozle-radius, 0.5rem)",
                    border: "1px solid var(--nozle-border, var(--border))",
                    background: "var(--nozle-background, var(--background))",
                    color: "var(--nozle-foreground, var(--foreground))",
                    boxSizing: "border-box",
                  }}
                />
              )}
            </div>

            <p
              style={{
                color: "var(--nozle-muted-foreground, var(--muted-foreground))",
                fontSize: "0.875rem",
                margin: "0 0 1.25rem",
              }}
            >
              {Math.floor(finalAmount * creditsPerDollar).toLocaleString()} credits
              at {creditsPerDollar} credits per $1. Minimum ${minimumAmount}.
            </p>

            {error && (
              <p
                style={{
                  color: "oklch(0.6 0.2 25)",
                  marginBottom: "1rem",
                  fontSize: "0.875rem",
                }}
              >
                {error}
              </p>
            )}

            <div
              style={{
                display: "flex",
                gap: "0.75rem",
                justifyContent: "flex-end",
              }}
            >
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
                  color:
                    "var(--nozle-primary-foreground, var(--primary-foreground))",
                  cursor: loading ? "not-allowed" : "pointer",
                  fontWeight: 500,
                  opacity: loading ? 0.7 : 1,
                }}
                disabled={loading || finalAmount < minimumAmount}
              >
                {loading ? "Processing..." : `Add $${finalAmount}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
