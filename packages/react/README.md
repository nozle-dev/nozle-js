# @nozle-js/react

Browser-safe React components for Nozle's public plan catalog and merchant-controlled checkout.

## Credential boundary

- `pk_` is used only for `GET /api/v1/plans`.
- Secret keys stay on the merchant backend.
- The React package does not fetch customer billing, invoice, subscription, entitlement, or credit data.
- The React package never sends a customer ID.

## Install

```bash
npm install @nozle-js/react react react-dom @stripe/stripe-js @stripe/react-stripe-js
```

## Merchant-backed checkout

```tsx
import { BillingProvider, PricingTable } from "@nozle-js/react";

export function BillingPage({ csrfToken }: { csrfToken: string }) {
  return (
    <BillingProvider
      publishableKey={import.meta.env.VITE_NOZLE_PUBLISHABLE_KEY}
      createCheckout={async ({ planCode, returnUrl }) => {
        const response = await fetch("/api/billing/checkout", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
          },
          body: JSON.stringify({ planCode, returnUrl }),
        });

        if (!response.ok) throw new Error("Checkout failed");
        return response.json();
      }}
    >
      <PricingTable returnUrl={window.location.href} highlightPlan="pro" />
    </BillingProvider>
  );
}
```

The merchant endpoint authenticates the user, derives the Nozle customer from the authenticated user or team, validates the plan and HTTPS return URL, and calls Nozle with a restricted server-side `sk_`. Any browser-supplied customer identifier must be ignored or rejected.

`createCheckout` may return a hosted URL, an embedded Stripe client secret, `type: "completed"`, or `type: "scheduled"`. Paid plans activate only after Nozle processes verified Stripe success; a browser redirect is not proof of payment.

## Components

- `PricingTable` and `usePlans` read the public catalog with the publishable key.
- `CheckoutButton`, `UpgradeButton`, `UpgradeModal`, and the default `PricingTable` CTA call the merchant's `createCheckout` callback.
- `Checkout` renders Stripe hosted/embedded checkout results supplied by the merchant.
- Gates, usage displays, `PlanBadge`, and `PaymentMethodDisplay` are presentational and consume caller-supplied data.

Customer billing, invoices, cancellation, top-ups, subscriptions, entitlements, and credits belong behind authenticated merchant endpoints. Never put an `sk_`, master key, or internal credential in browser code.
