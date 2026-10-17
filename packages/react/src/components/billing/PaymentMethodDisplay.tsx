"use client";

/**
 * PaymentMethodDisplay — shows saved payment method details.
 * Displays last4, brand, expiry. "Update Payment Method" button opens checkout.
 */

import { useAppearance } from "../../appearance/context.js";
import { T, border, buttonRadius, buttonStyle, surface, text, type Appearance } from "../../appearance/tokens.js";

export interface PaymentMethod {
  last4: string;
  brand: string;
  expMonth: number;
  expYear: number;
}

export interface PaymentMethodDisplayProps {
  paymentMethod?: PaymentMethod;
  onUpdatePaymentMethod?: () => void;
  updateHref?: string;
  appearance?: Appearance;
}

const BRAND_LABELS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  discover: "Discover",
  jcb: "JCB",
  diners: "Diners Club",
  unionpay: "UnionPay",
};

export function PaymentMethodDisplay({
  paymentMethod,
  onUpdatePaymentMethod,
  updateHref = "/billing/update-payment",
  appearance,
}: PaymentMethodDisplayProps) {
  const { root } = useAppearance(appearance);
  const handleUpdate = () => {
    if (onUpdatePaymentMethod) {
      onUpdatePaymentMethod();
    } else {
      window.location.href = updateHref;
    }
  };

  return (
    <div {...root("paymentMethod", { ...surface, display: "flex", flexDirection: "column", gap: "0.75rem" })}>
      {paymentMethod ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            padding: "0.75rem 1rem",
            border: border(),
            borderRadius: `calc(${T.radius} * 0.6)`,
          }}
        >
          <span style={{ fontWeight: 600, color: T.foreground }}>
            {BRAND_LABELS[paymentMethod.brand.toLowerCase()] ??
              paymentMethod.brand}
          </span>
          <span style={text.secondary}>•••• {paymentMethod.last4}</span>
          <span style={text.meta}>
            Expires {String(paymentMethod.expMonth).padStart(2, "0")}/
            {String(paymentMethod.expYear).slice(-2)}
          </span>
        </div>
      ) : (
        <p style={{ ...text.secondary, margin: 0 }}>
          No payment method on file.
        </p>
      )}
      <button type="button"
        onClick={handleUpdate}
        style={{
          ...buttonStyle("outline"),
          alignSelf: "flex-start",
          padding: "0.375rem 0.875rem",
          borderRadius: buttonRadius(`calc(${T.radius} / 2)`),
        }}
      >
        Update Payment Method
      </button>
    </div>
  );
}
