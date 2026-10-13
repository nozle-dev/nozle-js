# @nozle-js/react

React components for Nozle's public catalog, checkout, and customer billing portal.

## Credential boundary

- `pk_` is used only for `GET /api/v1/plans`.
- Secret keys stay on the merchant backend.
- Presentational components consume caller-supplied customer state.
- `BillingPortal` uses a customer-scoped session from your backend for Core GraphQL reads.
- Your backend chooses the customer and authorizes the selected external subscription ID.

## Install

```bash
npm install @nozle-js/react@0.10.0 react react-dom @stripe/stripe-js @stripe/react-stripe-js
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

`createCheckout` returns a `stripe`, `razorpay`, `hosted`, `processing`, `completed`, or `scheduled` result. Nozle payment fulfillment determines activation; Razorpay requires capture. A browser redirect or callback alone does not prove activation.

## Payment providers: Stripe and Razorpay

Your merchant backend returns whatever result Nozle gives for the customer's connected provider, and `CheckoutButton` handles each `type`:

| Result `type` | Provider | What `CheckoutButton` does |
| --- | --- | --- |
| `stripe` | Stripe | Calls `onStripeClientSecret` with the `cs_` Embedded Checkout secret. Render `Checkout` with it |
| `razorpay` | Razorpay | Loads Razorpay's `checkout.js`, opens the modal, then calls your `verifyCheckout` and polls your `getCheckoutStatus` (30 attempts, one second apart) |
| `hosted` | Razorpay | Navigates to `payment_url` (HTTPS only), a Razorpay payment link |
| `processing` | Razorpay | Polls `getCheckoutStatus` until the order is ready, then opens it |
| `completed`, `scheduled` | Either | Calls `onComplete` or `onScheduled`. No payment is collected |

Nozle returns the Stripe secret but not your Stripe publishable key, so pass your own `pk_` key for the connected Stripe account to `Checkout`. For Razorpay, the server supplies `key_id`, `order_id`, amount and currency; `razorpayKeyId` is deprecated. Razorpay supports only INR.

```tsx
import { useState } from "react";
import { BillingProvider, Checkout, CheckoutButton } from "@nozle-js/react";

export function Upgrade({ csrfToken }: { csrfToken: string }) {
  const [clientSecret, setClientSecret] = useState<string>();
  const post = (path: string, body: object) =>
    fetch(path, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
      body: JSON.stringify(body),
    }).then((response) => {
      if (!response.ok) throw new Error("Request failed");
      return response.json();
    });

  return (
    <BillingProvider
      publishableKey="pk_your_catalog_key"
      createCheckout={({ planCode, returnUrl, idempotencyKey }) =>
        post("/api/billing/checkout", { planCode, returnUrl, idempotencyKey })
      }
      // Razorpay only. Your backend calls nozle.verifyCheckout / nozle.checkoutStatus
      // with an sk_ key and the customer and subscription scope it derived.
      verifyCheckout={(checkoutId, verification) =>
        post(`/api/billing/checkout/${checkoutId}/verify`, verification)
      }
      getCheckoutStatus={(checkoutId) =>
        fetch(`/api/billing/checkout/${checkoutId}`, { credentials: "include" }).then(
          (response) => {
            if (!response.ok) throw new Error("Status failed");
            return response.json();
          },
        )
      }
    >
      <CheckoutButton
        planCode="pro_monthly"
        onStripeClientSecret={setClientSecret}
        onSuccess={() => window.location.reload()}
        onComplete={() => window.location.reload()}
      />
      {clientSecret && (
        <Checkout
          clientSecret={clientSecret}
          publishableKey="pk_live_your_stripe_key"
          onComplete={() => window.location.reload()}
        />
      )}
    </BillingProvider>
  );
}
```

`CheckoutButton` rejects a Razorpay result without `checkout_id`, `key_id` and `order_id`, and fails when `BillingProvider` has no `verifyCheckout`. A modal `payment.failed` event shows "Payment failed. You can retry checkout." For a UPI AutoPay mandate, pass `registerMandate` to `CheckoutButton`; the modal then receives `customer_id` and `recurring: "1"` from the result. Show success only after both `status` and `fulfillment_status` are `succeeded`. See the [Stripe](https://docs.nozle.dev/integrations/stripe) and [Razorpay](https://docs.nozle.dev/integrations/razorpay) integration guides.

## Components

- `PricingTable` and `usePlans` read the public catalog with the publishable key.
- `CheckoutButton`, `UpgradeButton`, `UpgradeModal`, and the default `PricingTable` CTA call the merchant's `createCheckout` callback.
- `Checkout` renders provider checkout results and accepts merchant verification/status callbacks directly.
- `BillingPortal`, `CancellationControl`, and `PlanChangeControl` provide customer subscription management through authenticated merchant adapters.
- Gates, usage displays, `PlanBadge`, and `PaymentMethodDisplay` are presentational and consume caller-supplied data.

Authenticate portal sessions and management actions on your merchant backend. Return customer-scoped portal tokens at runtime; never embed an `sk_`, master key, or portal token in a static browser bundle.

## Native billing portal and subscription management

`BillingPortal` renders subscriptions, current usage, invoices/PDFs, billing details, and
wallets directly in React. It does not require `BillingProvider` or Tailwind. Reads use a
customer-scoped Core session; optional `cancellationActions` enable Cancel + Keep through
your authenticated merchant backend and the Node.js or Python SDK. Optional `planChangeActions`
add quoted upgrades, scheduled downgrades, exact pending-change withdrawal, and payment recovery.

```tsx
import {
  BillingPortal, BillingPortalError,
  type CancellationActions, type CreateBillingPortalSession,
} from "@nozle-js/react";

async function post(path: string, body: object, signal: AbortSignal) {
  const response = await fetch(path, {
    method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body), signal,
  });
  if (!response.ok) throw new BillingPortalError(
    [401, 403].includes(response.status) ? "unauthorized" :
      response.status === 409 ? "changed" : "request",
  );
  return response.json();
}
const createSession: CreateBillingPortalSession = ({ signal }) =>
  post("/api/billing/session", {}, signal);
const cancellationActions: CancellationActions = {
  preview: ({ signal, ...input }) => post("/api/billing/cancellation/preview", input, signal),
  apply: ({ signal, ...input }) => post("/api/billing/cancellation", input, signal),
};
export function BillingPage({ accountId }: { accountId: string }) {
  return <BillingPortal key={accountId} createSession={createSession}
    cancellationActions={cancellationActions} locale="en-US" />;
}
```

The matching runnable Node merchant example and React app are in
[`examples/billing-portal`](../../examples/billing-portal). The Python SDK repository has the
equivalent `examples/billing_portal` backend. They authenticate a server-selected demo customer
and require same-origin JSON requests. For your app, derive the customer from the authenticated
user/team, retain your CSRF protection, reject browser-supplied customer identities, and check
subscription ownership on the server.

### Session and action contracts

- `createSession({ signal })` returns `{ token, apiUrl? }`. On your server, call Core's
  `GET /api/v1/customers/{external_id}/portal_url` and extract the token from `/customer-portal/{token}`.
  Return it with the Core base URL (default `https://api.nozle.app/core`). The component sends
  `customer-portal-token` on GraphQL requests. Self-hosted Core must allow your app origin/header.
- `preview({ subscriptionId, operation, signal })` returns `{ operation, effectiveAt, renewalAt }`.
  The identifier is the **external subscription ID**. Operations are `cancel` and `uncancel`.
  Dates are ISO strings; `renewalAt` may be null. Preserve the exact `effectiveAt` string.
- `apply({ subscriptionId, operation, idempotencyKey, expectedEffectiveAt?, signal })` uses the
  existing server SDK transition method. On the server, choose `timing: "end_of_period"` for
  cancel and forward `expectedEffectiveAt` as the `expected_effective_at` guard. Core rejects a
  changed date before mutation. Uncancel accepts no settlement overrides. Retain merchant-side
  idempotency records across restarts so uncertain retries use the same upstream key.
- Map HTTP409 state/date conflicts to `BillingPortalError("changed")`, requiring a new preview.
  Map expired authentication to `"unauthorized"`. Never display raw upstream error bodies.

Without `cancellationActions`, the overview remains usable and cancel/keep controls are absent.
After each attempt the portal reads the selected subscription through customer-scoped GraphQL.
Cancellation stays separate from active status; Keep is available before the ending boundary.
Cancellation removes any pending plan change. Keep restores renewal without restoring the
removed change. Outstanding invoices and usage charges remain subject to merchant policy.

Use the exported `CancellationControl`, `CancellationSubscription`, and `CancellationActions`
on a custom billing page. Supply `refresh(signal)` to read persisted subscription state from
your authenticated source. It must not return an optimistic local update. The component
supports `onChanged`, redacted `onError`, `locale`, `timezone`, and stylesheet `nonce`.

Keep `createSession` stable and change its identity or the portal's `key` when the authenticated
customer changes. Remount a standalone cancellation control on customer changes too. Old
requests are aborted and previous customer content is hidden; portal tokens stay in memory.

Customize with `className`, `style`, `nonce`, and CSS variables `--nozle-portal-accent`,
`--nozle-portal-background`, `--nozle-portal-text`, `--nozle-portal-muted`,
`--nozle-portal-muted-background`, and `--nozle-portal-border`. UI copy is English; `locale`
formats amounts/dates. Errors use `code: "session" | "unauthorized" | "request" | "changed"`.

### Plan changes and payment recovery

Pass `planChangeActions` to `BillingPortal`, or use the standalone `PlanChangeControl`.
Its adapter provides `load`, `status`, `preview`, `apply`, and `withdraw`; use
`verifyCheckout` and `getCheckoutStatus` for scoped payment verification/recovery.
The Node.js `0.9.0` and Python `0.9.0` SDKs introduced the matching backend methods. Use `0.9.1` of either backend SDK for the Feature Event timestamp fix used by provider capture.

Load eligible plans for the selected external subscription, confirm the signed quote,
and retain the same quote and idempotency key for uncertain retries. Upgrades activate
after required payment is fulfilled; downgrades use end-of-period timing with `keep_anchor`.
Withdrawal targets the exact internal pending UUID. Reload authoritative subscription
and checkout state after submission or a page reload.

See the [billing portal guide](https://docs.nozle.dev/sdks/react/billing-portal) for
complete typed adapters, standalone controls, and the runnable Node/Python integrations.
The hosted Nozle backend supports these flows; self-hosted deployments need the matching
subscription-management endpoints and cancellation-date guard.

## License

Proprietary. Contact Nozle about licensing.
