# Nozle JavaScript SDKs

This monorepo contains the Nozle SDK for Node.js backends and the React package for public pricing, checkout, and billing screens. Use the Node package with a secret key on your server. Use the React package with a publishable key and authenticated callbacks to your own backend.

| Package | Current release | Use it for |
| --- | --- | --- |
| [`@nozle-js/node`](packages/node/README.md) | `0.23.0` | Billing, subscriptions, credits, usage and Cost Events, entitlements, margins, invoices, alerts, webhooks, and LLM usage capture |
| [`@nozle-js/react`](packages/react/README.md) | `0.24.0` | Public catalog, checkout UI, billing portal, billing hooks, and customer-facing controls |

## Install

```bash
npm install @nozle-js/node@0.23.0
npm install @nozle-js/react@0.24.0 @tanstack/react-query react react-dom
```

Install only the package your application needs. The React package runs in the browser; all customer-scoped writes and reads that need a secret key belong on your backend.

## Backend quick start

```ts
import { Nozle } from "@nozle-js/node";

const nozle = new Nozle({ apiKey: process.env.NOZLE_SECRET_KEY! });

// Derive this ID from your authenticated user or organization.
const customerId = "customer-123";
const plans = await nozle.plans();
console.log(plans.map((plan) => plan.code));
const { allowed } = await nozle.can(customerId, "code_completion");

if (allowed) {
  await nozle.track(customerId, "copilot_action", { mode: "planning" });
}
```

Set `NOZLE_SECRET_KEY` to an `sk_` key in your server environment. The default Engine and Core URLs are `https://api.nozle.app/engine` and `https://api.nozle.app/core`; set `host`, or override `baseUrl` and `eventsUrl`, in the `Nozle` constructor for a local stack. See the [Node package guide](packages/node/README.md) for checkout, credits, subscriptions, Cost Events, and provider wrappers.

## React checkout

`BillingProvider` accepts a publishable key for the catalog and a callback to your authenticated merchant backend for checkout. That backend must derive the customer ID from the signed-in session and verify ownership of checkout and subscription IDs.

```tsx
import { BillingProvider, PricingTable } from "@nozle-js/react";

export function BillingPage({ csrfToken }: { csrfToken: string }) {
  return (
    <BillingProvider
      publishableKey="pk_your_catalog_key"
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
      <PricingTable returnUrl={window.location.href} />
    </BillingProvider>
  );
}
```

Both Stripe and Razorpay flow through the same `checkout()` call. Stripe returns the hosted Stripe Checkout page (`type: "hosted"`, redirect to `url`); Razorpay returns an order for the Razorpay modal (`type: "razorpay"`). Your backend confirms the outcome through webhooks or by reloading billing state; only a paid upgrade (`plan_upgrade_intent_id`) and Razorpay have `checkoutStatus()`, plus `verifyCheckout()` for Razorpay. The Node guide shows both flows side by side, and the React guide shows `CheckoutButton` handling each result. See the [Stripe](https://docs.nozle.dev/integrations/stripe) and [Razorpay](https://docs.nozle.dev/integrations/razorpay) integration guides.

See the [React package guide](packages/react/README.md) for the complete callback shape, provider responses, and billing portal setup. The [runnable billing portal example](examples/billing-portal/README.md) includes a Node merchant server and React app. Its demo login and file store are examples; use your application's authentication and shared transactional storage in production.

## Guides and releases

- [Nozle documentation](https://docs.nozle.dev)
- [Node installation and workflows](https://docs.nozle.dev/sdks/node/installation)
- [React installation and workflows](https://docs.nozle.dev/sdks/react/installation)
- [Changelog](CHANGELOG.md)
- [Release process](RELEASING.md)

Node `0.13.0` adds `captureFetch` and `recordUsage` for any LLM client, `createBillingHandler` for the React billing hooks, webhook verification, invoices, alerts and opt-in retries, and throws `NozleApiError` on every failed call. React `0.11.0` adds billing hooks on TanStack Query, the `appearance` API with predefined themes, `CurrentPlan`, credit and usage components, and pricing components that read the catalog; it has breaking changes to styling and to `PlanCard` and `PlanComparison` props. See each package guide for the full API and the changelog for release history.

## Workspace suspended or card required (402)

When your Nozle workspace is suspended because its Nozle invoices are unpaid, every API call answers HTTP 402 with `code` `workspace_suspended`. A workspace without a verified card answers 402 with `code` `card_required` the same way. `NozleApiError` (Node) and `BillingRequestError` (React) carry `status` 402 and `code` `workspace_suspended` or `card_required`; see the Node and React package guides.
Never retry blindly: the SDK does not retry a 402. Add a card in the Nozle dashboard (`card_required`) or pay the Nozle invoices (`workspace_suspended`) and calls work again at once. Events sent during the suspension are refused, not queued.

A customer of yours whose unpaid invoices are past the plan's grace is refused on its own with 402 `customer_payment_overdue`: Node `can()` returns `allowed: false` with that `reason`, and usage and events for the customer throw `NozleApiError` with that code (see the Node package guide).

## Contributing

Run `npm ci` once at the repository root: it installs both workspaces, including the React test dependencies (jsdom, Testing Library). Then:

```bash
npm test --workspace=@nozle-js/node                                # Node unit tests (Vitest, Node 20+)
npm run typecheck --workspace=@nozle-js/node
npm test --workspace=@nozle-js/react -- --no-file-parallelism      # React tests run in jsdom
npm run build --workspace=@nozle-js/node && node --test examples/billing-portal/*.test.mjs
```

`dist/` is not committed; rebuild it (`npm run build --workspace=<package>`) before running an example against your changes. CI runs the same steps (`.github/workflows/node-ci.yml`).

## License

Both packages are licensed under MIT: see [packages/node/LICENSE](packages/node/LICENSE) and [packages/react/LICENSE](packages/react/LICENSE).
