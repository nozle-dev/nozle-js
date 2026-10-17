# Changelog

## Unreleased

### Added

- React: `nozle` and `nozleDark` themes in `@nozle-js/react/themes`, the Nozle dashboard look (flat cards, a hard ink shadow on buttons, Nunito). New variables `buttonRadius` and `buttonBorderWidth` (every button), `buttonBorderColor` and `buttonShadow` (primary buttons only), `colorSecondary` and `colorInput` (secondary buttons), and `labelFont`, `labelTextTransform`, `labelLetterSpacing` and `fontFamilyNumbers` for table headers, status labels and numbers; a theme's `planCardLayout: "panel"` lays plan cards out like the dashboard, with `ACTIVE` on the current plan. Defaults keep the current look.
- React: `PricingTable` gives plans priced above the current plan the primary button and the current and cheaper plans the plain one (without a current plan, only the highlighted plan gets the primary button). `neobrutal` primary buttons get a black border and offset shadow.
- React: tables (`CreditHistory`, `UsageBreakdown`, `PlanComparison` and the billing portal's usage and invoice tables) follow the Nozle dashboard table: a bordered frame, a tinted header band, 20px cell padding, one-line cells and right-aligned numbers in tabular figures; each theme styles the header labels its own way. The billing portal's invoice search is a single search field with an icon.
- `createBillingHandler`'s `subscription` route and React `useSubscription()` include `past_due` (the customer has an unpaid invoice past its due date); `CurrentPlan` shows it as an alert. Node `invoices.list` takes `paymentOverdue`.
- Node.js: `nozle.alerts.list / get / create / update / delete` manage usage alerts of a subscription (`{ subscriptionId }`) and balance alerts of a wallet (`{ customerId, walletCode }`). Nozle sends `alert.triggered` when one fires.
- Node.js: `nozle.invoices.list(customerId, options)`, `get(invoiceId)` and `downloadUrl(invoiceId)` (the PDF URL, or `null` while it is generated). `createBillingHandler` serves `invoices` (the session customer's finalized invoices) and `invoice-download` (404 for another customer's invoice); React `useInvoices({ page })` and `useInvoiceDownload()` read them.
- Node.js: `nozle.webhooks.verify({ body, headers, hmacKey? })` checks `X-Nozle-Signature` (`jwt`: Nozle's public key, read once with the secret key and cached; `hmac`: the signing secret) and returns the event (`id`, `type`, `objectType`, `organizationId`, `object`, `payload`), or throws `WebhookVerificationError` with a `code`. `createWebhookHandler(nozle, { hmacKey?, onEvent })` returns a Fetch API handler that answers 200, 400 for a forged request, or 500 when `onEvent` throws.
- React: `CurrentPlan` shows the customer's plan, status, price, scheduled change, usage against the plan's limits and a near-limit notice; it reads the billing hooks by default.
- React: customer billing hooks built on TanStack Query: `useSubscription`, `useEntitlement(featureCode)`, `useCreditBalance(creditSystemCode?)`, `useCreditHistory()` (paged, `operations` ready for `CreditHistory`), `useUsage({ period })` (current period for `UsageBreakdown`, past periods for `UsageTrend`), `useUpgradePreview(planCode)` and `useBillingRefresh()`. They read your backend route set as `BillingProvider billingEndpoint` (with `billingHeaders` for a CSRF token), so the browser holds no secret key and sees only the signed-in customer. `BillingProvider` takes an optional `queryClient` to share your app's cache; the hooks pass their client explicitly and never replace your `QueryClientProvider`. Failed requests throw `BillingRequestError` (`status`, `code`, `requestId`); a 4xx is not retried.
- Node.js: `createBillingHandler(nozle, { getCustomerId })` returns a web-standard `(request) => Response` handler that serves those hooks (routes `subscription`, `entitlement`, `credits`, `credit-history`, `usage`, `preview`) with your secret key. The customer always comes from `getCustomerId`, never from the request. Works in Next.js route handlers, Hono, Remix, Bun and Deno.
- Node.js: `getSubscriptions(customerId)`, `currentUsage(customerId, { subscriptionId? })` and `pastUsage(customerId, { subscriptionId?, periods? })` read Core subscriptions and usage; their types (`CoreSubscription`, `CustomerUsage`) come from the OpenAPI spec.
- Node.js: `apiKey` is optional. When it is not passed, `new Nozle()` reads the `NOZLE_SECRET_KEY` environment variable and throws if that is not set either. An explicit `apiKey` is used as before.
- Node.js: `host` option (default `https://api.nozle.app`). It fills in `baseUrl` (`${host}/engine`) and `eventsUrl` (`${host}/core`) when they are not given. `baseUrl` and `eventsUrl` keep their meaning and win over `host`.
- Node.js: opt-in retries. Set `maxRetries` (default `0`, no retries) and optionally `retryDelayMs` (default 500, doubling up to 10 seconds, or the `Retry-After` header when sent) on `new Nozle({...})`. Network errors, timeouts, `429` and `5xx` are retried, only for requests that are safe to repeat: reads, calls that carry an `Idempotency-Key` (such as `usage.track`), event, cost event and customer writes, and the read-only `usage.check` and subscription transition preview. `subscribe()`, `checkout()`, `checkAndDeduct()` and other writes without a key are never retried. The `timeout` option now applies to each attempt.
- React: `PricingTable`, `PlanCard` and `PlanComparison` read what each plan gives from the public catalog: entitlements, credit grants and the usage prices of every charge model except `custom` and `dynamic`. `PricingTable` accepts an optional `features` (an array aligned to the rendered plans, or an object keyed by plan code), `PlanCard` an optional `features` list and `PlanComparison` optional `features` rows. When passed, they replace the generated lines.
- React: `planFeatures(plan)` and `comparisonRows(plans)` return the same lines and rows for your own layout. The `CatalogEntitlement`, `CatalogCreditGrantRule`, `CatalogCharge`, `CatalogPrivilege` and `ComparisonRow` types are exported, and `CatalogPlan` and `PricingPlan` declare the optional `entitlements`, `credit_grant_rules` and `charges` fields.
- React: `CreditBalance` and `CreditHistory` render the SDK's credit balance and credit operations (`CreditBalanceData`, `CreditOperationData`), each with loading, error and empty states; `CreditHistory` has a load-more button for the SDK's `next_cursor`. `usageItems(entitlements, results)` builds `UsageDashboard` rows from a plan's metered entitlements and `can()` results. `UsageDashboard` takes `error` and `emptyMessage`, and `UsageMeter` and `UsageDashboard` accept a `null` or missing `limit` and show `Unlimited`.
- React: `PricingTable` and `PlanComparison` sort plans by base price, cheapest first (`PricingTable` puts custom plans last), instead of showing the catalog's newest-first order. Plans in different currencies stay grouped, and ties keep the catalog order. Pass `sort` to use your own order. `sortPlansByPrice(plans)` is exported. A `features` array is aligned to the sorted order.
- React: `UsageBreakdown` (a table of each feature's units and amount for one period, with the total) and `UsageTrend` (a bar chart of the amount, or the units of one `featureCode`, per period) render the usage your backend reads from Core's `current_usage` and `past_usage` (`CustomerUsageData`, `ChargeUsageData`). Both have loading, error and empty states and no chart library.
- Node.js: a compile-time contract between the SDK's types and the API schemas. `npm run generate:openapi` regenerates `src/generated/openapi.ts` from the published spec (or `NOZLE_OPENAPI_SPEC`), and `npm run typecheck` fails when an SDK type declares a key the API schema does not have, promises a field the API does not send, or types it differently. The generated file is not part of the published package.
- Node.js: a request contract test (`request-contract.test.ts`) checks the body of SDK calls against the API request schema: no unknown key, no `null` where the schema does not allow it, enum values only. `scripts/sync_openapi_requests.py` refreshes the schemas from `nozle-openapi.yaml`. Node.js already leaves out options you do not set, because `JSON.stringify` drops `undefined`; the test keeps it that way.
- Node.js: `captureFetch` reports once per client and event code when no Feature has that code (`onError` gets an error with `code: "feature_not_found"`): the usage is stored but not billed until a metered Feature with that code exists. Recording is not blocked. `wrapOpenAI` and `wrapAnthropic` take the same `onError`; without it their failures stay silent as before.
- Node.js: `nozle.captureFetch(options, fetch?)` returns a `fetch` that records the token usage of every successful LLM response. Pass it as the `fetch` option of the OpenAI or Anthropic SDK, a Vercel AI SDK provider, LangChain, or any client that accepts one. Usage is recognised by the response shape: OpenAI-compatible `usage` (any OpenAI-compatible API, including the Responses API), Anthropic `usage` and Gemini `usageMetadata`. Streams are read as the app reads them; chat completion streams are asked for usage (`stream_options.include_usage`, turn off with `includeStreamUsage: false`). The customer comes from `customerId` (a string or a function per request) or the `X-Nozle-Customer-Id` request header, which is not sent to the provider. Recording never changes or fails the provider response; failures go to `onError`.
- Node.js: `nozle.recordUsage({ customerId, model, inputTokens, outputTokens, ... })` records usage your code read itself, and rejects if it could not be recorded.

### Breaking

- React: `@tanstack/react-query` (v5) is a peer dependency. `usePlans` uses it and keeps its return shape, plus `refetch`.
- React: `PlanCard` takes `plan` (a catalog plan) with `isCurrent`, `returnUrl`, `onSelect` and the optional `features`. It no longer takes `id`, `name`, `monthlyPrice`, `annualPrice`, `description`, `isAnnual` or `children`, and the `Plan` type export is removed.
- React: `PlanComparison` takes `plans` (catalog plans) and the optional `features`. A plan that lacks an entitlement shows a cross. `features` rows are keyed by plan `code`, not `id`.

### Changed

- Every call that gets a non-2xx response now throws `NozleApiError` (`status`, `code`, `errorDetails`, `hasCode()`), not only checkout and margin calls. This covers `track`, `usage.track`, `usage.check`, `can`, `costEvents.track`, `subscribe`, `cancelSubscription`, `ping`, `plans`, `checkAndDeduct`, the subscription lookup, `customers`, `creditSystems`, `credits`, `entities` and `entitySubscriptions`. The message keeps its `<operation> failed: <status> <statusText>` form, and the class still extends `Error`, so existing `catch` code keeps working; the subscription lookup message now carries the status text too.
- `NozleApiError` adds `requestId` (the `X-Request-Id` response header, which Core sends and the Engine does not yet) and `retryAfter` (seconds, from `Retry-After`).
- Node.js: usage events recorded by `wrapOpenAI`, `wrapAnthropic` and `captureFetch` use the provider's response id as the transaction id (`llm-<format>-<id>`), so the same response is never recorded twice. Events also carry `provider_host` when known.

### Removed

- Node.js: `PingResult.version` and `SubscriptionOptions.blocked_reason` are removed from the types. The API has never sent either field.

### Fixed

- `usage.track()` reuses the timestamp it filled in when the same idempotency key is sent again on the same client, so a retry no longer fails with 409 `idempotency_key_reused`. The client remembers the last 1000 keys; a retry from another process or after a restart must pass `timestamp`.
- React: `PricingTable` shows the real billing interval (`/quarter`, `/week`, `/6 months`) instead of `/month` for every plan that is not yearly.
- React: `PlanCard` prints the plan's own currency instead of `$` for every plan.
- React: the annual toggle no longer shows a hard-coded "Save 20%".
- Node.js: `CanResult.limit` and `CanResult.remaining` are typed `number | null`. The API has always sent `null` for a feature without a limit, while the type said `number | undefined`. Code that checked `=== undefined` for "no limit" should check `== null`.

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
