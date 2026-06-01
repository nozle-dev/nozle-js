"use client";

/**
 * PaymentMethodDisplay — shows saved payment method details.
 * Displays last4, brand, expiry. "Update Payment Method" button opens checkout.
 */

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
}: PaymentMethodDisplayProps) {
  const handleUpdate = () => {
    if (onUpdatePaymentMethod) {
      onUpdatePaymentMethod();
    } else {
      window.location.href = updateHref;
    }
  };

  return (
    <div className="space-y-3">
      {paymentMethod ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            padding: "0.75rem 1rem",
            border: "1px solid var(--nozle-border, var(--border))",
            borderRadius: "0.5rem",
            fontSize: "0.875rem",
          }}
        >
          <span
            style={{
              fontWeight: 600,
              color: "var(--nozle-foreground, var(--foreground))",
            }}
          >
            {BRAND_LABELS[paymentMethod.brand.toLowerCase()] ??
              paymentMethod.brand}
          </span>
          <span
            style={{
              color: "var(--nozle-muted-foreground, var(--muted-foreground))",
            }}
          >
            •••• {paymentMethod.last4}
          </span>
          <span
            style={{
              color: "var(--nozle-muted-foreground, var(--muted-foreground))",
              fontSize: "0.75rem",
            }}
          >
            Expires {String(paymentMethod.expMonth).padStart(2, "0")}/
            {String(paymentMethod.expYear).slice(-2)}
          </span>
        </div>
      ) : (
        <p
          style={{
            color: "var(--nozle-muted-foreground, var(--muted-foreground))",
            fontSize: "0.875rem",
          }}
        >
          No payment method on file.
        </p>
      )}
      <button
        onClick={handleUpdate}
        style={{
          background: "transparent",
          border: "1px solid var(--nozle-primary, var(--primary))",
          color: "var(--nozle-primary, var(--primary))",
          padding: "0.375rem 0.875rem",
          borderRadius: "0.375rem",
          fontSize: "0.875rem",
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        Update Payment Method
      </button>
    </div>
  );
}
