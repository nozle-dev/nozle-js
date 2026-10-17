# Changelog

## Unreleased

## Node.js 0.13.0 — 2026-10-17

### Added

- `nozle.captureFetch(options, fetch?)` returns a `fetch` that records the token usage of every successful LLM response. Pass it as the `fetch` option of the OpenAI or Anthropic SDK, a Vercel AI SDK provider, LangChain, or any client that accepts one. Usage is recognised by the response shape: OpenAI-compatible `usage` (any OpenAI-compatible API, including the Responses API), Anthropic `usage` and Gemini `usageMetadata`. Streams are read as the app reads them; chat completion streams are asked for usage (`stream_options.include_usage`, turn off with `includeStreamUsage: false`). When the app aborts a stream, the usage already seen is still recorded. The customer comes from `customerId` (a string or a function per request) or the `X-Nozle-Customer-Id` request header, which is not sent to the provider. Recording never changes or fails the provider response; failures go to `onError`. `detectUsage` and `normalizeGeminiUsage` and the `DetectedUsage` and `ProviderUsageFormat` types are exported for your own parsing.
- `nozle.recordUsage({ customerId, model, inputTokens, outputTokens, ... })` records usage your code read itself, and rejects if it could not be recorded.
- `captureFetch` reports once per client and event code when no Feature has that code (`onError` gets an error with `code: "feature_not_found"`): the usage is stored but not billed until a metered Feature with that code exists. Recording is not blocked. `wrapOpenAI` and `wrapAnthropic` take the same `onError`; without it their failures stay silent as before.
- `createBillingHandler(nozle, { getCustomerId })` returns a web-standard `(request) => Response` handler that serves the `@nozle-js/react` billing hooks with your secret key. The last path segment picks the route: `subscription` (with `past_due`, true when the customer has an unpaid invoice past its due date), `entitlement`, `credits`, `credit-history`, `usage`, `preview`, `invoices` (the customer's finalized invoices) and `invoice-download` (404 for another customer's invoice). `BILLING_ROUTES` lists them. The customer always comes from `getCustomerId`, never from the request. Works in Next.js route handlers, Hono, Remix, Bun and Deno.
- `getSubscriptions(customerId)`, `currentUsage(customerId, { subscriptionId? })` and `pastUsage(customerId, { subscriptionId?, periods? })` read Core subscriptions and usage; their types (`CoreSubscription`, `CustomerUsage`) come from the OpenAPI spec.
- `nozle.invoices.list(customerId, options)`, `get(invoiceId)` and `downloadUrl(invoiceId)` (the PDF URL, or `null` while it is generated). `list` takes `paymentOverdue` to return only invoices past their due date.
- `nozle.alerts.list / get / create / update / delete` manage usage alerts of a subscription (`{ subscriptionId }`) and balance alerts of a wallet (`{ customerId, walletCode }`). Nozle sends `alert.triggered` when one fires.
- `nozle.webhooks.verify({ body, headers, hmacKey? })` checks `X-Nozle-Signature` (`jwt`: Nozle's public key, read once with the secret key and cached; `hmac`: the signing secret) and returns the event (`id`, `type`, `objectType`, `organizationId`, `object`, `payload`), or throws `WebhookVerificationError` with a `code`. `createWebhookHandler(nozle, { hmacKey?, onEvent })` returns a Fetch API handler that answers 200, 400 for a forged request, or 500 when `onEvent` throws.
- `apiKey` is optional. When it is not passed, `new Nozle()` reads the `NOZLE_SECRET_KEY` environment variable and throws if that is not set either. An explicit `apiKey` is used as before.
- `host` option (default `https://api.nozle.app`). It fills in `baseUrl` (`${host}/engine`) and `eventsUrl` (`${host}/core`) when they are not given. `baseUrl` and `eventsUrl` keep their meaning and win over `host`.
- Opt-in retries. Set `maxRetries` (default `0`, no retries) and optionally `retryDelayMs` (default 500, doubling up to 10 seconds, or the `Retry-After` header when sent) on `new Nozle({...})`. Network errors, timeouts, `429` and `5xx` are retried, only for requests that are safe to repeat: reads, calls that carry an `Idempotency-Key` (such as `usage.track`), event, cost event and customer writes, and the read-only `usage.check` and subscription transition preview. `subscribe()`, `checkout()`, `checkAndDeduct()` and other writes without a key are never retried. The `timeout` option now applies to each attempt.
- `NozleApiError` adds `requestId` (the `X-Request-Id` response header, which Core sends and the Engine does not yet) and `retryAfter` (seconds, from `Retry-After`).

### Changed

- Every call that gets a non-2xx response now throws `NozleApiError` (`status`, `code`, `errorDetails`, `hasCode()`), not only checkout and margin calls. This covers `track`, `usage.track`, `usage.check`, `can`, `costEvents.track`, `subscribe`, `cancelSubscription`, `ping`, `plans`, `checkAndDeduct`, the subscription lookup, `customers`, `creditSystems`, `credits`, `entities` and `entitySubscriptions`. The message keeps its `<operation> failed: <status> <statusText>` form, and the class still extends `Error`, so existing `catch` code keeps working; the subscription lookup message now carries the status text too.
- Usage events recorded by `wrapOpenAI`, `wrapAnthropic` and `captureFetch` use the provider's response id as the transaction id (`llm-<format>-<id>`), so the same response is never recorded twice. Events also carry `provider_host` when known.
- `CanResult.limit` and `CanResult.remaining` are typed `number | null`. The API has always sent `null` for a feature without a limit, while the type said `number | undefined`. Code that checked `=== undefined` for "no limit" should check `== null`.

### Deprecated

- `checkAndDeduct()` is marked `@deprecated`; use `usage.check()` and `usage.track()` with a credit system.

### Removed

- `PingResult.version` and `SubscriptionOptions.blocked_reason` are removed from the types. The API has never sent either field.

### Fixed

- `usage.track()` reuses the timestamp it filled in when the same idempotency key is sent again on the same client, so a retry no longer fails with 409 `idempotency_key_reused`. The client remembers the last 1000 keys; a retry from another process or after a restart must pass `timestamp`.
- `wrapOpenAI` and `wrapAnthropic` return the SDK's own `APIPromise` and `Stream`, so `withResponse()`, `asResponse()`, `chat.completions.parse()`, `messages.stream()` / `finalMessage()`, `stream.controller` and `toReadableStream()` work on a wrapped client. Usage is recorded once, when the response is read (not for `asResponse()`, which leaves the body to you); a stream records when it is fully iterated. Errors reject only to the caller.
- The optional peer dependency is `@anthropic-ai/sdk`, the package `wrapAnthropic` wraps, instead of the unrelated `anthropic` package.

## React 0.11.0 — 2026-10-17

### Breaking

- Components no longer read Tailwind classes, host CSS or shadcn's `--primary`, `--primary-foreground` and `--border` variables. Pass your colours as `appearance.variables` instead (for example `colorPrimary: "var(--primary)"`). Without an `appearance`, components use the `light` look: primary `#4f46e5`. The billing portal's green accent (`#526949`) is gone; set `colorPrimary` or the older `--nozle-portal-accent` to keep it.
- `@tanstack/react-query` (v5) is a required peer dependency. `usePlans` now runs on TanStack Query through `BillingProvider`'s query client and keeps its return shape, plus `refetch`.
- `PricingTable` no longer marks a plan "Custom" because its name or code contains "enterprise" or "custom". List the codes of plans sold on request in `contactSalesPlans`; their card shows "Custom" and a "Contact Sales" button that opens `enterpriseEmail`.
- `PlanCard` takes `plan` (a catalog plan) with `isCurrent`, `returnUrl`, `onSelect` and the optional `features`. It no longer takes `id`, `name`, `monthlyPrice`, `annualPrice`, `description`, `isAnnual` or `children`, and the `Plan` type export is removed.
- `PlanComparison` takes `plans` (catalog plans) and the optional `features`. A plan that lacks an entitlement shows a cross. `features` rows are keyed by plan `code`, not `id`.

### Added

- `appearance` on `BillingProvider` and on every component that renders UI. It takes a `theme` from `@nozle-js/react/themes` (`light`, `dark`, `minimal`, `neobrutal`, `nozle` or `nozleDark`; an array stacks them, last wins), your own `variables`, and per-element `elements`, where a string adds a class name and an object adds inline styles. Every part has a fixed `nozle-<key>` class, such as `nozle-pricingTable` or `nozle-planCard__price`. A component's own `appearance` goes on top of the provider's. Components render without Tailwind or host CSS; they read `--nozle-*` CSS variables, and the older `--nozle-portal-*` and `--nozle-pricing-*` names still work. `Checkout` passes the resolved theme to Stripe's Payment Element (Stripe's `night` theme on a dark background). `useAppearance` and the `Appearance`, `Theme`, `Variables`, `Elements`, `ElementKey`, `UseAppearance` and `ElementProps` types are exported.
- `PricingTable` takes `highlightStyle`: `outline` (default) draws the highlighted card's border in `colorHighlight`; `filled` paints the card in `colorHighlight` and its text and button in `colorHighlightForeground`. Both variables default to the primary colours. `highlightLabel` sets the badge on the highlighted card (default "Most Popular"; `null` shows no badge).
- Two more themes, `nozle` and `nozleDark`, give the Nozle dashboard look (flat cards, a hard ink shadow on buttons, Nunito). New variables `buttonRadius` and `buttonBorderWidth` (every button), `buttonBorderColor` and `buttonShadow` (primary buttons only), `colorSecondary` and `colorInput` (secondary buttons), and `labelFont`, `labelTextTransform`, `labelLetterSpacing` and `fontFamilyNumbers` for table headers, status labels and numbers; a theme's `planCardLayout: "panel"` lays plan cards out like the dashboard, with `ACTIVE` on the current plan. `neobrutal` primary buttons get a black border and offset shadow.
- Text roles. New variables `fontTitle`, `fontHeading`, `fontMetric`, `fontBody`, `fontMeta` and `fontAction` (CSS `font` shorthands, written as `--nozle-font-title` and so on) set the type of every element, with `labelFont` as the label role; each defaults to a size in `fontFamily` (`fontMetric` in `fontFamilyNumbers` when set, in tabular figures). Every component root sets the body role, so no text takes its size, font or colour from the host page, including the `PricingTable` toggle, the `UsageAlert` dismiss button, the `CheckoutButton` status and error, `Checkout`, the billing portal and its dialogs. `nozle` and `nozleDark` set the dashboard scale (title 20/900, heading 14/900, price 24/800 in Nunito, body 13, meta 11.5, buttons 14/800); `neobrutal` sets bolder titles and headings.
- Customer billing hooks built on TanStack Query: `useSubscription` (with `past_due`), `useEntitlement(featureCode)`, `useCreditBalance(creditSystemCode?)`, `useCreditHistory()` (paged, `operations` ready for `CreditHistory`), `useUsage({ period })` (current period for `UsageBreakdown`, past periods for `UsageTrend`), `useUpgradePreview(planCode)`, `useInvoices({ page })`, `useInvoiceDownload()` (resolves an invoice's PDF URL, or `null` while it is generated) and `useBillingRefresh()`. They read your backend route set as `BillingProvider billingEndpoint` (with `billingHeaders` for a CSRF token), served by `createBillingHandler` from `@nozle-js/node`, so the browser holds no secret key and sees only the signed-in customer. `BillingProvider` takes an optional `queryClient` to share your app's cache; the hooks pass their client explicitly and never replace your `QueryClientProvider`. Failed requests throw `BillingRequestError` (`status`, `code`, `requestId`); a 4xx is not retried.
- `CurrentPlan` shows the customer's plan, status, price, scheduled change, usage against the plan's limits and a near-limit notice, and an alert when the subscription is past due. It reads the billing hooks by default; `subscription`, `usage`, `details` and `actions` can be passed instead. `currentPlanMeters(entitlements, usage)` returns its meter rows for your own layout.
- `PricingTable`, `PlanCard` and `PlanComparison` read what each plan gives from the public catalog: entitlements, credit grants and the usage prices of every charge model except `custom` and `dynamic`. `PricingTable` accepts an optional `features` (an array aligned to the rendered plans, or an object keyed by plan code), `PlanCard` an optional `features` list and `PlanComparison` optional `features` rows. When passed, they replace the generated lines.
- `planFeatures(plan)` and `comparisonRows(plans)` return the same lines and rows for your own layout. The `CatalogEntitlement`, `CatalogCreditGrantRule`, `CatalogCharge`, `CatalogPrivilege` and `ComparisonRow` types are exported, and `CatalogPlan` and `PricingPlan` declare the optional `entitlements`, `credit_grant_rules` and `charges` fields.
- `PricingTable` and `PlanComparison` sort plans by base price, cheapest first (`PricingTable` puts `contactSalesPlans` last), instead of showing the catalog's newest-first order. Plans in different currencies stay grouped, and ties keep the catalog order. Pass `sort` to use your own order. `sortPlansByPrice(plans)` is exported. A `features` array is aligned to the sorted order.
- `CreditBalance` and `CreditHistory` render the SDK's credit balance and credit operations (`CreditBalanceData`, `CreditOperationData`), each with loading, error and empty states; `CreditHistory` has a load-more button for the SDK's `next_cursor`. `usageItems(entitlements, results)` builds `UsageDashboard` rows from a plan's metered entitlements and `can()` results. `UsageDashboard` takes `error` and `emptyMessage`, and `UsageMeter` and `UsageDashboard` accept a `null` or missing `limit` and show `Unlimited`.
- `UsageBreakdown` (a table of each feature's units and amount for one period, with the total) and `UsageTrend` (a bar chart of the amount, or the units of one `featureCode`, per period) render the usage your backend reads from Core's `current_usage` and `past_usage` (`CustomerUsageData`, `ChargeUsageData`). Both have loading, error and empty states and no chart library.
- `PricingTable`, `PlanComparison`, `CurrentPlan`, `Checkout`, `UpgradeModal` and `BillingPortal` show "Powered by" and the Nozle logo when the merchant's Nozle plan keeps the branding (`meta.nozle_branding` in the publishable-key catalog, `nozleBranding` in the portal). Only the outermost of nested components shows it. `useNozleBranding()` and `PoweredByNozle` are exported for your own UI. The portal's plain "Powered by Nozle" footer is replaced. `PricingTable` and `usePlans` share one cached catalog request.
- Changing plan in `PlanChangeControl` (and the billing portal) lists the plans as choices with price, upgrade or downgrade, and, inside a `BillingProvider`, each plan's description and features from the catalog; the confirmation step has a Back button. `UpgradeModal` takes `onBack`. The portal subscription card puts View usage, Change plan and Cancel subscription in one action row.

### Changed

- `PricingTable` gives plans priced above the current plan the primary button and the current and cheaper plans the plain one (without a current plan, only the highlighted plan gets the primary button).
- Tables (`CreditHistory`, `UsageBreakdown`, `PlanComparison` and the billing portal's usage and invoice tables) follow the Nozle dashboard table: a bordered frame, a tinted header band, 20px cell padding, one-line cells and right-aligned numbers in tabular figures; each theme styles the header labels its own way. The billing portal's invoice search is a single search field with an icon.
- `UsageDashboard` has the same card frame as the other data components. A `UsageMeter` value is in the text colour below 80% and turns to the warning colour at 80% and the danger colour at 95%, instead of always taking the bar colour.
- Muted text follows `colorForeground`. When `colorMutedForeground` is not set it is `colorForeground` mixed 62% into `colorCard` instead of a fixed `#6b7280`; the `light` and `dark` themes use the same mix. Error and success text use contrast-adjusted colours like warning text already did. Sizes are now the same for the same kind of text across components, so the default look changes slightly: plan names are 16px, prices and balances 28px, buttons 14px, badges and status pills use the label role. The panel plan card no longer hard-codes the dashboard sizes; the themes supply them.

### Deprecated

- `nozlePreset` (`@nozle-js/react/styles/preset`) has no effect on the components, which no longer use Tailwind. It is kept so existing imports still build. Theme the components with `appearance` instead.

### Fixed

- The built package keeps `"use client"` on the main entry, so a Next.js server component can render the components without a wrapper; before, it failed with "createContext only works in Client Components". `@nozle-js/react/themes` stays importable from server components.
- `useUsage()` is typed per period: `CustomerUsageData | null` for the current period and `CustomerUsageData[]` with `{ period: "past" }`, so its data passes to `UsageBreakdown` and `UsageTrend` without a cast. `PricingPlan.description` accepts `null`, so `usePlans().plans` passes to `PricingTable`, `PlanCard` and `PlanComparison` as is. `PoweredByNozle` used on its own takes the theme's colours.
- Component buttons (`UpgradePrompt`, `PlanCard`, `PricingTable` and its toggle, `UsageAlert` dismiss, `PaymentMethodDisplay`) are `type="button"`, so they no longer submit a form they sit inside.
- `PricingTable` shows the real billing interval (`/quarter`, `/week`, `/6 months`) instead of `/month` for every plan that is not yearly.
- `PlanCard` prints the plan's own currency instead of `$` for every plan.
- The annual toggle no longer shows a hard-coded "Save 20%".

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
