# Changelog

## Unreleased

### Added

- React: `PricingTable`, `PlanCard` and `PlanComparison` read what each plan gives from the public catalog: entitlements, credit grants and the usage prices of every charge model except `custom` and `dynamic`. `PricingTable` accepts an optional `features` (an array aligned to the rendered plans, or an object keyed by plan code), `PlanCard` an optional `features` list and `PlanComparison` optional `features` rows. When passed, they replace the generated lines.
- React: `planFeatures(plan)` and `comparisonRows(plans)` return the same lines and rows for your own layout. The `CatalogEntitlement`, `CatalogCreditGrantRule`, `CatalogCharge`, `CatalogPrivilege` and `ComparisonRow` types are exported, and `CatalogPlan` and `PricingPlan` declare the optional `entitlements`, `credit_grant_rules` and `charges` fields.

### Breaking

- React: `PlanCard` takes `plan` (a catalog plan) with `isCurrent`, `returnUrl`, `onSelect` and the optional `features`. It no longer takes `id`, `name`, `monthlyPrice`, `annualPrice`, `description`, `isAnnual` or `children`, and the `Plan` type export is removed.
- React: `PlanComparison` takes `plans` (catalog plans) and the optional `features`. A plan that lacks an entitlement shows a cross. `features` rows are keyed by plan `code`, not `id`.

### Fixed

- React: `PricingTable` shows the real billing interval (`/quarter`, `/week`, `/6 months`) instead of `/month` for every plan that is not yearly.
- React: `PlanCard` prints the plan's own currency instead of `$` for every plan.
- React: the annual toggle no longer shows a hard-coded "Save 20%".

## Node.js 0.12.0 — 2026-10-14

### Added

- `customers.upsert()` accepts `billingConfiguration` (`paymentProvider`, `paymentProviderCode`, `providerCustomerId`, `syncWithProvider`, `providerPaymentMethods`) and sends it as Core's `billing_configuration`, so a customer can be linked to an existing Stripe customer in the same call. Upserts without it send the same body as before.

## Node.js 0.11.0 — 2026-10-13

### Changed

- `track()` and provider wrappers submit Feature Events to the Go Engine endpoint at `baseUrl/api/v1/events` (default `https://api.nozle.app/engine/api/v1/events`). Payloads, authentication and transaction IDs are unchanged.
- Custom event-ingestion deployments must now set `baseUrl`. `eventsUrl` continues to configure Core billing resources and subscription discovery.

## Node.js 0.10.0 — 2026-10-13

### Breaking

- **Credit systems read `nozle_id`.** `nozle.creditSystems.list()` now takes each credit system's `id` from the `nozle_id` key and no longer falls back to `lago_id`. Against a server that still sends only the old key, `id` is `undefined`. Ship this release together with the Nozle Core release that sends `nozle_id`.

### Added

- `NozleApiError`, exported from the package, is thrown for failed `checkout()`, `checkoutInvoice()`, `verifyCheckout()`, `checkoutStatus()` and margin calls. It keeps the `<operation> failed: <status> <statusText>` message and adds `status`, `code`, `errorDetails` and `hasCode()`, so callers can match codes such as `razorpay_requires_inr`, `payment_provider_required` or `invalid_checkout_signature`, including codes listed in `error_details`.
- Checkout result types declare fields the API returns: `plan_upgrade_intent_id`, `external_entity_id` and `external_subscription_id` on Razorpay results; `amount_cents`, `currency`, `expires_at`, `invoice_id` and `plan_upgrade_intent_id` on `hosted` and `processing` results; `plan_upgrade_intent_id` on Stripe results; and `payment_source`, `invoice_id`, `amount_cents`, `transition_direction` and `transition_policy` on `completed` and `scheduled` results.
- `verifyCheckout()` rejects a missing `razorpay_order_id`, `razorpay_payment_id` or `razorpay_signature` before sending a request.
- README sections for Stripe and Razorpay checkout, including `processing` results for Stripe and Razorpay, Stripe-hosted credit top-up links, idempotency edge cases, and the REST customer provider assignment note.

### Fixed

- The subscription that `track()` resolves for a customer is cached for the life of the client. The cache entry is now dropped after `subscribe()`, `cancelSubscription()`, `applySubscriptionTransition()`, `checkout()`, and a scoped `checkoutStatus()` or `verifyCheckout()`, and `checkoutInvoice()` clears every entry, so the next `track()` looks the subscription up again. A change that is still unpaid is not visible to the lookup, so a `track()` between a paid `checkout()` and its payment can cache the old subscription; call `checkoutStatus()` with a scope after payment, or pass `subscriptionId` explicitly.

### Removed

- `pending_subscription_id` is removed from the Node.js `CheckoutResult` type. The API never returned it; the pending subscription ID of a `scheduled` result is `subscription_id`. The `pending_subscription_id` request parameter of `withdrawPendingSubscriptionChange()` is unchanged.

### Changed

- `checkoutStatus()`, `verifyCheckout()` and `checkoutInvoice()` errors now start with their own method name instead of `checkout failed`. Code that matches the old message text must change; match `NozleApiError` and `code` instead.
- Margin request errors are `NozleApiError` instances, so `err.code` and `err.errorDetails` survive. The message format is unchanged and the class still extends `Error`.

### Deprecated

- `feature` on `checkAndDeduct()` is optional and no longer sent. The endpoint never used it, so the deduction depends only on `customerId` and `credits`. Existing calls that pass it keep working.
- The Stripe `publishable_key`, `stripe_account` and `url` fields are not returned by plan and invoice checkout; use your own Stripe publishable key.

## React 0.10.2 — 2026-10-13

### Added

- Checkout result types (`RazorpayCheckoutResult`, `ProcessingCheckoutResult`, `HostedCheckoutResult`, `CompletedCheckoutResult`, `ScheduledCheckoutResult` and the Stripe result) declare the same fields as Node.js 0.10.0, including `plan_upgrade_intent_id`, `amount_cents`, `currency`, `expires_at`, `invoice_id`, `transition_direction` and `transition_policy`.
- README section for Stripe and Razorpay checkout showing how `CheckoutButton` handles each result `type`.

### Fixed

- `PricingTable` no longer leaves an empty grid and an unhandled promise rejection when its own catalog request fails. It renders `Plans could not be loaded: <reason>` (`HTTP <status>` or the thrown message) in the existing `role="alert"` message. `onCheckoutError` still receives only checkout errors, not catalog failures. Pass `plans` to skip the request.

### Removed

- `pending_subscription_id` is removed from the React `ScheduledCheckoutResult` type. The API never returned it; the pending subscription ID of a `scheduled` result is `subscription_id`.

### Changed

- **License:** `@nozle-js/react` now declares `"license": "MIT"` and ships a `LICENSE` file. Earlier versions had no license field.
- Documentation: `processing` results are not Razorpay-only, the Stripe `Checkout` `onComplete` does not fire when the session redirects to `returnUrl`, and checkout idempotency edge cases are described. `publishable_key`, `stripe_account` and `url` are marked as never returned.

## Node.js 0.9.1 — 2026-10-11

### Fixed

- Convert RFC 3339 Feature Event timestamps to Unix seconds when sending events to Core, including timestamps produced by the OpenAI and Anthropic wrappers. Numeric timestamps remain unchanged, and malformed strings fail before the HTTP request.

## Node.js 0.9.0 — 2026-09-29

### Added

- Selected-subscription options, signed plan-change quotes, and withdrawal of pending changes for merchant billing portals.
- Checkout and transition support for selected subscriptions, quote IDs, cancellation-date guards, and scoped status and verification.

See the [0.9.0 release](https://github.com/nozle-dev/nozle-js/releases/tag/node-v0.9.0) for installation and verification details. React has its own version and `react-v*` release tags.
