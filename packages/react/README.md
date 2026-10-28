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
npm install @nozle-js/react@0.11.0 @tanstack/react-query react react-dom
```

The billing hooks (`useSubscription`, `useUsage`, `useInvoices` and the others) read your backend through `BillingProvider billingEndpoint`, served by `createBillingHandler` from `@nozle-js/node`; see [Hooks](https://docs.nozle.dev/sdks/react/hooks). Components need no Tailwind or host CSS. Style them with `appearance` on `BillingProvider` or on a component, using a theme from `@nozle-js/react/themes`, your own variables and per-element overrides; see [Styling](https://docs.nozle.dev/sdks/react/styling). The theme, colours and pricing table options saved in the dashboard (Developers > Customize SDK) apply automatically as the lowest layer, read from the same `/api/v1/plans` request as `PricingTable`; set `savedAppearance={false}` on `BillingProvider` to opt out. They arrive with that request, so the first paint uses the default look; to avoid that (and to server-render the saved theme), read `meta.sdk_appearance` of `GET /api/v1/plans` on your server and pass it as `initialSavedAppearance`.

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

## Pricing table and plan families

`PricingTable` shows one card per plan family. A family groups the billing intervals of one offer (for example Pro monthly and Pro yearly) and carries the pricing table settings you set in the Nozle dashboard (Developers → Customize SDK). `GET /api/v1/plans` returns them as `families` next to `plans`:

| Family field | Effect |
| --- | --- |
| `show_on_pricing: false` | The family is hidden. Plans with `pending_deletion: true` are left out, and a family without plans is hidden |
| `pricing_position` | Cards are ordered by it, ascending. Families without a position follow in API order |
| `pricing_highlighted` | The card is highlighted (at most one). The `highlightPlan` prop, a family code or plan code, overrides it |
| `badge_text` / `cta_text` | Badge on the highlighted card (default "Most Popular"; the `highlightLabel` prop replaces it) and button text (default "Get {name}") |
| `features[].show_on_pricing: false` | The feature is left out of the card |
| `features[].display_position` | Features are ordered by it, then by name |
| `features[].show_description` | The feature's description appears as a muted line under the bullet |

The interval switch offers the intervals of the visible families (Weekly, Monthly, Quarterly, Every 6 months, Annual) and is hidden when there is only one. Each card shows the family's plan for the selected interval as a per-month price (`$40.83 /mo`) with its billing line (`Billed $490 yearly · save 17%`, saving against the family's monthly plan), and a family without a plan for that interval shows its nearest interval. Feature values come from the selected plan's entitlements, for example `Projects: 20` or `Storage (GB: 10, Tier: fast)`. The button and checkout use the selected plan's code.

```tsx
<PricingTable
  returnUrl={window.location.href}
  defaultInterval="yearly"
  locale="en-GB"
  features={{
    pro: ["Priority support", { label: "API access", description: "REST and GraphQL" }],
  }}
  onSelect={(plan, family) => console.log(plan.code, family?.code)}
/>
```

- `defaultInterval` picks the first interval (`"annual"` also works). Otherwise Monthly when offered, else the first one. `showToggle={false}` hides the switch.
- `features` is a record keyed by family code (or plan code) that replaces the catalog features of that card, or an array aligned to the rendered cards.
- `contactSalesPlans` takes family codes as well as plan codes: the card shows "Custom" and a "Contact Sales" button.
- Cards follow the `appearance` theme like the other components: the highlighted family uses `colorHighlight` (default `colorPrimary`) and `highlightStyle`, and a theme's `planCardLayout: "panel"` lays family cards out as panels with the same billing line. The default highlight (`#4f46e5` in the `light` theme) keeps its white text at WCAG AA contrast; if you set your own `colorHighlight`, check that `colorHighlightForeground` on it reaches 4.5:1.
- `annualDiscountLabel` replaces the computed "Save N%" on the Annual option.
- `locale` (default `en-US`) formats prices and feature values. Prices are exact in the currency's minor units (`¥1,500` for 1500 JPY), and whole amounts show no decimals (`$20`).
- Pass `plans` and `families` to render without fetching. With `plans` alone, or with an older API that returns no `families`, each plan is its own card as before, sorted by price (or by `sort`), with its price per its own interval (`$14.99 /quarter`, no per-month price or billing line) and what the plan gives as its features.

For a custom pricing page, use the same rules with `usePlans()`:

```tsx
const { plans, families } = usePlans();
const intervals = getAvailableIntervals({ plans, families });
const cards = getPricingCards({ plans, families }, { interval: "yearly", locale: "en-US" });
// cards[i]: { family, plan, name, price, pricePeriod, billing, features, highlighted, badge, cta, ... }
```

`getPricingIntervalOptions(catalog)` returns the switch options with their labels and best saving, and `getDefaultInterval(catalog, preferred?)` the interval to start on.

## Payment providers: Stripe and Razorpay

Your merchant backend returns whatever result Nozle gives for the customer's connected provider, and `CheckoutButton` handles each `type`:

| Result `type` | Provider | What `CheckoutButton` does |
| --- | --- | --- |
| `hosted` | Stripe, Razorpay link | Redirects the page to `url` (HTTPS only), with no status polling. Stripe sends the customer back to your `returnUrl`; confirm the outcome there |
| `razorpay` | Razorpay | Loads Razorpay's `checkout.js`, opens the modal, then calls your `verifyCheckout` and polls your `getCheckoutStatus` (30 attempts, one second apart) |
| `processing` | Razorpay or Stripe | Polls `getCheckoutStatus`. For Razorpay it opens the order once ready; Stripe returns `processing` when a quoted upgrade is replayed while its webhook is pending |
| `completed`, `scheduled` | Either | Calls `onComplete` or `onScheduled`. No payment is collected |

Stripe checkout is the Stripe-hosted page: there is no embedded form, no Stripe publishable key to pass and no Stripe peer dependency. `CheckoutButton` and `useCheckoutSession().startCheckout` redirect to `url`; pass `cancelUrl` (forward it to `nozle.checkout()`) to choose where Stripe sends a customer who leaves the page. For Razorpay, the server supplies `key_id`, `order_id`, amount and currency; `razorpayKeyId` is deprecated. Razorpay supports only INR.

```tsx
import { BillingProvider, CheckoutButton } from "@nozle-js/react";

export function Upgrade({ csrfToken }: { csrfToken: string }) {
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
        onSuccess={() => window.location.reload()}
        onComplete={() => window.location.reload()}
      />
    </BillingProvider>
  );
}
```

After a hosted payment the customer lands on your `returnUrl` (it may contain `{CHECKOUT_SESSION_ID}`, which Stripe fills in); show success from that page by reloading billing status (the subscription or `useEntitlement`), or from the `invoice.payment_succeeded` / subscription webhooks on your backend. A Stripe `checkout_id` is the Stripe session id, not a status id, so `getCheckoutStatus` is never called with it; only a paid upgrade has a status call, keyed by `plan_upgrade_intent_id`. A new-subscription checkout retried while the subscription is still incomplete fails with HTTP 422 `subscription_incomplete`, even with the same idempotency key; your backend can recover with an invoice checkout for the `invoice_id` from the first response. An invoice checkout retried with the same key and a different body currently returns HTTP 500, not 409.

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

## Workspace suspended or card required (402)

When your Nozle workspace is suspended because its Nozle invoices are unpaid, every API call answers HTTP 402 with `code` `workspace_suspended`. A workspace without a verified card answers 402 with `code` `card_required` the same way. The billing hooks expose a `BillingRequestError` with `status` 402 and `code` `workspace_suspended` in `error`, and do not retry it. Show your own message; the portal and hooks do not crash the app.
Never retry blindly: the SDK does not retry a 402. Add a card in the Nozle dashboard (`card_required`) or pay the Nozle invoices (`workspace_suspended`) and calls work again at once. Events sent during the suspension are refused, not queued.

## License

Proprietary. Contact Nozle about licensing.
