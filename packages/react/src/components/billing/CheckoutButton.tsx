/**
 * CheckoutButton — Initiates checkout for a plan.
 * UI-02: Calls POST /api/v1/checkout, detects processor type from the response,
 * and branches to the appropriate payment flow:
 *   - Stripe hosted checkout: redirect to url
 *   - Stripe embedded Elements: emit clientSecret via onStripeClientSecret callback
 *   - Razorpay: inject Razorpay.js and open the checkout modal
 *   - Legacy (no type): redirect to url for backwards compatibility
 * Uses CSS variable theming with --nozle-* namespace.
 */

"use client";
import React from "react";

import { useState } from "react";
import { useBillingPortal } from "./BillingPortalProvider.js";

export interface CheckoutButtonProps {
  planId: string;
  label?: string;
  apiBaseUrl?: string;
  className?: string;
  style?: React.CSSProperties;
  onError?: (error: Error) => void;
  /** Required for Razorpay checkout path — the Razorpay publishable key (key_id). */
  razorpayKeyId?: string;
  /** Called with the Stripe Payment Intent / Checkout Session client secret
   *  when the BFF returns type:'stripe' without a hosted url.
   *  The host app is responsible for mounting Stripe Elements. */
  onStripeClientSecret?: (clientSecret: string) => void;
  /** Called with the Razorpay payment ID after a successful Razorpay payment. */
  onSuccess?: (paymentId: string) => void;
}

interface RazorpayOptions {
  key: string;
  order_id: string;
  name?: string;
  description?: string;
  handler: (response: { razorpay_payment_id: string }) => void;
  modal?: { ondismiss?: () => void };
}

declare global {
  interface Window {
    Razorpay: new (opts: RazorpayOptions) => { open(): void };
  }
}

type CheckoutResponse =
  | { type: "stripe"; url: string; clientSecret?: string }
  | { type: "stripe"; clientSecret: string; url?: string }
  | { type: "razorpay"; orderId: string }
  | { url: string }; // legacy — no type field

/**
 * Injects the Razorpay checkout.js script once, then resolves.
 * If the script is already present, resolves immediately.
 */
function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById("razorpay-js")) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.id = "razorpay-js";
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Razorpay.js"));
    document.body.appendChild(script);
  });
}

/**
 * CheckoutButton initiates a checkout session and routes to the appropriate
 * payment processor path.
 *
 * Must be used inside a BillingPortalProvider.
 */
export function CheckoutButton({
  planId,
  label = "Get Started",
  apiBaseUrl = "https://api.nozle.app",
  className,
  style,
  onError,
  razorpayKeyId,
  onStripeClientSecret,
  onSuccess,
}: CheckoutButtonProps): React.ReactElement {
  const { customerId, apiKey } = useBillingPortal();
  const [loading, setLoading] = useState(false);

  async function handleClick(): Promise<void> {
    setLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ planId, customerId }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Checkout failed`);
      }

      const data = (await response.json()) as CheckoutResponse;

      if ("type" in data && data.type === "razorpay") {
        // Razorpay checkout path
        if (!razorpayKeyId) {
          onError?.(
            new Error("razorpayKeyId prop required for Razorpay checkout"),
          );
          return;
        }
        await loadRazorpayScript();
        const rzp = new window.Razorpay({
          key: razorpayKeyId,
          order_id: data.orderId,
          handler: (r) => {
            onSuccess?.(r.razorpay_payment_id);
          },
          modal: {
            ondismiss: () => setLoading(false),
          },
        });
        rzp.open();
      } else if ("type" in data && data.type === "stripe") {
        // Stripe checkout path
        if (data.url) {
          window.location.href = data.url;
        } else if (data.clientSecret) {
          onStripeClientSecret?.(data.clientSecret);
        } else {
          onError?.(
            new Error("Stripe checkout: no url or clientSecret in response"),
          );
        }
      } else if ("url" in data && data.url) {
        // Legacy path — plain url redirect
        window.location.href = data.url;
      } else {
        onError?.(new Error("Unknown checkout response format"));
      }
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error("Checkout failed");
      onError?.(error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={() => void handleClick()}
      disabled={loading}
      className={className}
      style={{
        padding: "0.75rem 1.5rem",
        borderRadius: "var(--nozle-radius, 0.5rem)",
        border: "none",
        background: "var(--nozle-primary, var(--primary))",
        color: "var(--nozle-primary-foreground, var(--primary-foreground))",
        cursor: loading ? "not-allowed" : "pointer",
        fontWeight: 500,
        opacity: loading ? 0.7 : 1,
        ...style,
      }}
      aria-busy={loading}
    >
      {loading ? "Loading..." : label}
    </button>
  );
}
