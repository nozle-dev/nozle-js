"use client";

/**
 * CancelSubscriptionButton — two-step cancellation flow.
 *
 * Step 1 (confirm): Opens a confirmation dialog. "Keep Subscription" closes
 *                   without any API call.
 *
 * Step 2 (reason): "Confirm Cancel" transitions to a reason survey with 5
 *                  radio options. Selecting "Other" shows a free-text input.
 *                  "Submit Cancellation" calls DELETE /api/v1/subscriptions/{id}
 *                  with body { reason: string }.
 */

import { useState } from "react";
import { useOptionalBillingPortal } from "./BillingPortalProvider.js";

type CancelStep = "idle" | "confirm" | "reason";

export const CANCEL_REASONS = [
  "Too expensive",
  "Missing features",
  "Switching to competitor",
  "Not using it enough",
  "Other",
] as const;

export interface CancelSubscriptionButtonProps {
  subscriptionId: string;
  apiBaseUrl?: string;
  apiKey?: string;
  onCancelled?: () => void;
  onError?: (error: Error) => void;
}

export function CancelSubscriptionButton({
  subscriptionId,
  apiBaseUrl,
  apiKey,
  onCancelled,
  onError,
}: CancelSubscriptionButtonProps) {
  const portal = useOptionalBillingPortal();
  const [step, setStep] = useState<CancelStep>("idle");
  const [selectedReason, setSelectedReason] = useState("");
  const [otherText, setOtherText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDismiss = () => {
    setStep("idle");
    setSelectedReason("");
    setOtherText("");
  };

  const handleConfirmCancel = () => {
    setStep("reason");
  };

  const handleSubmitCancellation = async () => {
    const reason = selectedReason === "Other" ? otherText : selectedReason;
    const effectiveApiKey = apiKey ?? portal?.apiKey;
    const effectiveBaseUrl = apiBaseUrl ?? portal?.apiBaseUrl ?? "https://api.nozle.app";

    if (!effectiveApiKey) {
      const cancellationError = new Error(
        "CancelSubscriptionButton requires apiKey or BillingPortalProvider",
      );
      setError(cancellationError.message);
      onError?.(cancellationError);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${effectiveBaseUrl}/api/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${effectiveApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ reason }),
        },
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Cancellation failed`);
      }
      handleDismiss();
      onCancelled?.();
    } catch (err: unknown) {
      const cancellationError =
        err instanceof Error ? err : new Error("Cancellation failed");
      setError(cancellationError.message);
      onError?.(cancellationError);
    } finally {
      setLoading(false);
    }
  };

  const isSubmitDisabled =
    loading ||
    !selectedReason ||
    (selectedReason === "Other" && !otherText.trim());

  return (
    <>
      <button
        onClick={() => setStep("confirm")}
        style={{
          background: "transparent",
          border:
            "1px solid var(--nozle-destructive, var(--destructive, #dc2626))",
          color: "var(--nozle-destructive, var(--destructive, #dc2626))",
          padding: "0.375rem 0.875rem",
          borderRadius: "0.375rem",
          fontSize: "0.875rem",
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        Cancel Subscription
      </button>

      {step === "confirm" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Cancel subscription confirmation"
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.4)",
            zIndex: 50,
          }}
        >
          <div
            style={{
              background: "var(--nozle-background, var(--background, #fff))",
              border: "1px solid var(--nozle-border, var(--border))",
              borderRadius: "0.75rem",
              padding: "1.5rem",
              maxWidth: "28rem",
              width: "90%",
              boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
            }}
          >
            <h2
              style={{
                fontSize: "1.125rem",
                fontWeight: 600,
                marginBottom: "0.75rem",
              }}
            >
              Cancel Subscription?
            </h2>
            <p
              style={{
                color:
                  "var(--nozle-muted-foreground, var(--muted-foreground))",
                fontSize: "0.875rem",
                marginBottom: "1.5rem",
              }}
            >
              Your access will end at the end of the billing period.
            </p>
            <div
              style={{
                display: "flex",
                gap: "0.75rem",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={handleDismiss}
                style={{
                  background: "transparent",
                  border: "1px solid var(--nozle-border, var(--border))",
                  color: "var(--nozle-foreground, var(--foreground))",
                  padding: "0.375rem 0.875rem",
                  borderRadius: "0.375rem",
                  fontSize: "0.875rem",
                  cursor: "pointer",
                }}
              >
                Keep Subscription
              </button>
              <button
                onClick={handleConfirmCancel}
                style={{
                  background:
                    "var(--nozle-destructive, var(--destructive, #dc2626))",
                  border: "1px solid transparent",
                  color: "#fff",
                  padding: "0.375rem 0.875rem",
                  borderRadius: "0.375rem",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Confirm Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {step === "reason" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Cancellation reason survey"
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.4)",
            zIndex: 50,
          }}
        >
          <div
            style={{
              background: "var(--nozle-background, var(--background, #fff))",
              border: "1px solid var(--nozle-border, var(--border))",
              borderRadius: "0.75rem",
              padding: "1.5rem",
              maxWidth: "28rem",
              width: "90%",
              boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
            }}
          >
            <h2
              style={{
                fontSize: "1.125rem",
                fontWeight: 600,
                marginBottom: "0.5rem",
              }}
            >
              Why are you cancelling?
            </h2>
            <p
              style={{
                color:
                  "var(--nozle-muted-foreground, var(--muted-foreground))",
                fontSize: "0.875rem",
                marginBottom: "1rem",
              }}
            >
              Your feedback helps us improve.
            </p>
            {error && (
              <p
                role="alert"
                style={{
                  color: "var(--nozle-destructive, var(--destructive, #dc2626))",
                  fontSize: "0.875rem",
                  marginBottom: "1rem",
                }}
              >
                {error}
              </p>
            )}
            <fieldset
              style={{
                border: "none",
                padding: 0,
                margin: 0,
                marginBottom: "1rem",
              }}
            >
              <legend className="sr-only">Cancellation reason</legend>
              {CANCEL_REASONS.map((r) => (
                <label
                  key={r}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.375rem 0",
                    fontSize: "0.875rem",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="radio"
                    name="cancel-reason"
                    value={r}
                    checked={selectedReason === r}
                    onChange={() => setSelectedReason(r)}
                    aria-label={r}
                  />
                  {r}
                </label>
              ))}
            </fieldset>
            {selectedReason === "Other" && (
              <input
                type="text"
                placeholder="Please describe your reason"
                value={otherText}
                onChange={(e) => setOtherText(e.target.value)}
                aria-label="Other reason"
                style={{
                  width: "100%",
                  border: "1px solid var(--nozle-border, var(--border))",
                  borderRadius: "0.375rem",
                  padding: "0.5rem 0.75rem",
                  fontSize: "0.875rem",
                  marginBottom: "1rem",
                  background:
                    "var(--nozle-background, var(--background, #fff))",
                  color: "var(--nozle-foreground, var(--foreground))",
                  boxSizing: "border-box",
                }}
              />
            )}
            <div
              style={{
                display: "flex",
                gap: "0.75rem",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={handleDismiss}
                style={{
                  background: "transparent",
                  border: "1px solid var(--nozle-border, var(--border))",
                  color: "var(--nozle-foreground, var(--foreground))",
                  padding: "0.375rem 0.875rem",
                  borderRadius: "0.375rem",
                  fontSize: "0.875rem",
                  cursor: "pointer",
                }}
              >
                Keep Subscription
              </button>
              <button
                onClick={handleSubmitCancellation}
                disabled={isSubmitDisabled}
                style={{
                  background: isSubmitDisabled
                    ? "var(--nozle-muted, var(--muted, #f1f5f9))"
                    : "var(--nozle-destructive, var(--destructive, #dc2626))",
                  border: "1px solid transparent",
                  color: isSubmitDisabled
                    ? "var(--nozle-muted-foreground, var(--muted-foreground))"
                    : "#fff",
                  padding: "0.375rem 0.875rem",
                  borderRadius: "0.375rem",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  cursor: isSubmitDisabled ? "not-allowed" : "pointer",
                }}
              >
                {loading ? "Cancelling..." : "Submit Cancellation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
