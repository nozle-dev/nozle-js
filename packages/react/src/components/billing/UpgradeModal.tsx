/**
 * UpgradeModal — Shows live proration preview before confirming plan upgrade.
 * UI-02: Fetches proration preview from POST /api/v1/subscriptions/preview.
 * Shows credit, debit, net, and next billing date before confirming.
 * Uses CSS variable theming with --nozle-* namespace.
 */

"use client";
import React from "react";

import { useState, useEffect } from "react";

export interface ProrationPreview {
  credit: number;
  debit: number;
  net: number;
  nextBillingDate: string;
}

export interface UpgradeModalProps {
  isOpen: boolean;
  targetPlanId: string;
  customerId: string;
  apiBaseUrl?: string;
  apiKey?: string;
  onStripeClientSecret?: (clientSecret: string) => void;
  onCheckoutStarted?: () => void;
  onCompleted?: () => void;
  onScheduled?: () => void;
  onConfirm?: () => void;
  onCancel?: () => void;
}

/**
 * UpgradeModal shows proration preview from POST /api/v1/subscriptions/preview
 * before the customer confirms a plan upgrade.
 */
export function UpgradeModal({
  isOpen,
  targetPlanId,
  customerId,
  apiBaseUrl = "https://api.nozle.app",
  apiKey = "",
  onStripeClientSecret,
  onCheckoutStarted,
  onCompleted,
  onScheduled,
  onConfirm,
  onCancel,
}: UpgradeModalProps): React.ReactElement | null {
  const [preview, setPreview] = useState<ProrationPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!isOpen || !targetPlanId || !customerId) {
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setPreview(null);

    async function fetchPreview(): Promise<void> {
      try {
        const response = await fetch(
          `${apiBaseUrl}/api/v1/subscriptions/preview`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              plan_code: targetPlanId,
              customer_id: customerId,
            }),
          },
        );

        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status}: Failed to load proration preview`,
          );
        }

        const data = (await response.json()) as ProrationPreview;
        if (!cancelled) {
          setPreview(data);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : "Failed to load preview";
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void fetchPreview();

    return () => {
      cancelled = true;
    };
  }, [isOpen, targetPlanId, customerId, apiBaseUrl, apiKey]);

  async function handleConfirm(): Promise<void> {
    setConfirming(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          plan_code: targetPlanId,
          customer_id: customerId,
        }),
      });

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as {
          code?: string;
        };
        if (errorBody.code === "checkout_not_required_for_downgrade") {
          const changeResponse = await fetch(
            `${apiBaseUrl}/api/v1/subscriptions/change`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                plan_code: targetPlanId,
                customer_id: customerId,
              }),
            },
          );
          if (!changeResponse.ok) {
            throw new Error(`HTTP ${changeResponse.status}: Plan change failed`);
          }

          onScheduled?.();
          onConfirm?.();
          return;
        }

        throw new Error(`HTTP ${response.status}: Checkout failed`);
      }

      const data = (await response.json()) as {
        type?: string;
        url?: string;
        clientSecret?: string;
        client_secret?: string;
      };
      const clientSecret = data.clientSecret ?? data.client_secret;

      if (data.type === "completed") {
        onCompleted?.();
      } else if (data.url) {
        window.location.href = data.url;
      } else if (data.type === "stripe" && clientSecret && onStripeClientSecret) {
        onStripeClientSecret(clientSecret);
        onCheckoutStarted?.();
      } else if (data.type === "stripe" && clientSecret) {
        throw new Error("onStripeClientSecret is required for embedded Stripe checkout");
      } else {
        throw new Error("Unknown checkout response format");
      }

      onConfirm?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Checkout failed";
      setError(message);
    } finally {
      setConfirming(false);
    }
  }

  if (!isOpen) {
    return null;
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

  const modalStyle: React.CSSProperties = {
    background: "var(--nozle-background, var(--background))",
    color: "var(--nozle-foreground, var(--foreground))",
    border: "1px solid var(--nozle-border, var(--border))",
    borderRadius: "var(--nozle-radius, 0.5rem)",
    padding: "2rem",
    maxWidth: "28rem",
    width: "100%",
    boxShadow: "var(--nozle-shadow, 0 4px 6px -1px rgb(0 0 0 / 0.1))",
  };

  return (
    <div
      style={overlayStyle}
      role="dialog"
      aria-modal="true"
      aria-label="Upgrade plan"
    >
      <div style={modalStyle}>
        <h2
          style={{ fontSize: "1.25rem", fontWeight: 600, margin: "0 0 1rem" }}
        >
          Confirm Plan Upgrade
        </h2>

        {loading && (
          <p
            style={{
              color: "var(--nozle-muted-foreground, var(--muted-foreground))",
            }}
          >
            Loading proration preview...
          </p>
        )}

        {error && (
          <p style={{ color: "oklch(0.6 0.2 25)", marginBottom: "1rem" }}>
            {error}
          </p>
        )}

        {preview && !loading && (
          <div style={{ marginBottom: "1.5rem" }}>
            <div
              style={{
                background: "var(--nozle-muted, var(--muted))",
                borderRadius: "var(--nozle-radius, 0.5rem)",
                padding: "1rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              {preview.credit > 0 && (
                <div
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <span>Credit from current plan</span>
                  <span style={{ color: "oklch(0.6 0.15 150)" }}>
                    -${preview.credit.toFixed(2)}
                  </span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>New plan charge</span>
                <span>${preview.debit.toFixed(2)}</span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontWeight: 600,
                  borderTop: "1px solid var(--nozle-border, var(--border))",
                  paddingTop: "0.5rem",
                  marginTop: "0.25rem",
                }}
              >
                <span>You&apos;ll be charged today</span>
                <span>${preview.net.toFixed(2)}</span>
              </div>
            </div>
            <p
              style={{
                fontSize: "0.875rem",
                color:
                  "var(--nozle-muted-foreground, var(--muted-foreground))",
                marginTop: "0.75rem",
              }}
            >
              Your next billing date is{" "}
              {new Date(preview.nextBillingDate).toLocaleDateString()}.
            </p>
          </div>
        )}

        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={onCancel}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "var(--nozle-radius, 0.5rem)",
              border: "1px solid var(--nozle-border, var(--border))",
              background: "transparent",
              color: "var(--nozle-foreground, var(--foreground))",
              cursor: "pointer",
            }}
            disabled={confirming}
          >
            Cancel
          </button>
          <button
            onClick={() => void handleConfirm()}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "var(--nozle-radius, 0.5rem)",
              border: "none",
              background: "var(--nozle-primary, var(--primary))",
              color:
                "var(--nozle-primary-foreground, var(--primary-foreground))",
              cursor: confirming || loading ? "not-allowed" : "pointer",
              fontWeight: 500,
              opacity: confirming || loading ? 0.7 : 1,
            }}
            disabled={confirming || loading || !!error}
          >
            {confirming ? "Upgrading..." : "Confirm Upgrade"}
          </button>
        </div>
      </div>
    </div>
  );
}
