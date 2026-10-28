# Changelog

## Unreleased

## Node.js 0.22.0 and React 0.23.0 — 2026-10-29

Needs Core 11.10.0 (one plan family sold in several currencies).

### Added

- Node: `plans({ currency, externalCustomerId })` sends `currency` and `external_customer_id`. Family plans are listed in that currency, else the customer's locked currency, else each family's default. A family plan carries `family` (`PlanFamilyRef`: `code`, `currencies`, `default_currency`) and `prices` (`PlanPrice[]`: `currency`, `interval`, `plan_code`, `amount_cents`).
- Node: `checkout()` and `subscribe()` take `{ planFamilyCode, interval, currency? }` (`PlanFamilySelection`) instead of a plan code and send `plan_family_code`, `interval` and `currency`.
- React: `PricingTable` `currency` and `currencies` props and a currency switch, shown when the plans' families are sold in two or more currencies. Choosing a currency refetches the catalog with `currency`; checkout gets `currency` too. A card never mixes currencies, and savings and the upgrade direction compare plans of one currency only. `PricingPlan` gains `family` and `prices`; `PricingCatalog` gains `currency`; `getAvailableCurrencies(catalog)` lists the offered currencies.
- React: `CheckoutButton` takes `currency`, and `planFamilyCode` with `interval` instead of `planCode`.

### Changed

- React: `CreateCheckoutInput` has either `planCode` or `planFamilyCode` with `interval`, plus optional `currency`. A backend that reads `planCode` passes `planCode ?? { planFamilyCode, interval, currency }` to `nozle.checkout()`.

## React 0.22.0 — 2026-10-29

### Fixed

- Prices use each currency's minor units as Core's Money table defines them, not hundredths for every currency. `PlanCard`, `PlanComparison` and `CurrentPlan` showed JPY 100 times too low and mis-scaled three-decimal currencies (KWD, BHD, JOD, OMR, TND, IQD, LYD); `formatMinorAmount`, the pricing table, the billing portal and the usage components took digits from Intl, which differs from Core for HUF (0 decimals in Core) and MRO (5 minor units). CLF uses 4 decimals; every other currency stays at 100.
- `PlanCard` and `PlanComparison` take a `locale` prop (default `en-US`) for prices and feature values, and usage prices in feature lines follow the pricing table's `locale` instead of always `en-US`. `planFeatures()` and `comparisonRows()` take an optional `locale`.

## React 0.21.0 — 2026-10-29

### Added

- `Checkout` accepts `children`: your own pay UI replaces the default button, and `useCheckout()` (`confirmPayment`, `isProcessing`, `error`) now works inside it. Without children nothing changes.

## React 0.20.0 — 2026-10-28

### Added

- `NozleCardSetup` component and `mountCardSetup()` helper show the Nozle card page in a frame (`embed=1`) and report `succeeded`, `processing`, `failed`, `ready` and errors. Messages are accepted only from the card page origin and the frame's own window; a missing `ready` within 15 seconds calls `onError({ reason: "timeout" })` and the component falls back to a redirect. `CheckoutButton` still redirects by default. No Stripe dependency.

## Node.js 0.21.0 and React 0.19.0 — 2026-10-28

### Added

- Node: `NozleApiError.message` now ends with the server's `error` (or `message`) text, for example `margin/summary failed: 400 Bad Request: <server text>`; the `<operation> failed: <status> <statusText>` prefix is unchanged.
- Node: `NO_ACTIVE_SUBSCRIPTION` and `isNoActiveSubscription(error)`. The SDK's lookup error, the billing handler's 404 and Core's `subscription_not_found` are one case: `error.hasCode("active_subscription_not_found")` is true for all of them.
- Node: `credits.iterateOperations()`, `credits.iterateEntityOperations()`, `entities.iterate()` and the generic `paginate()` follow `next_cursor` page by page as an async iterator. Invoices are not paginated yet.
- Node: typed margin results `MarginSummary`, `MarginByCustomer`, `MarginByMetric`, `MarginByPlan`, `MarginByModel`, `MarginTrend` (from the Engine OpenAPI schemas).

### Changed

- Node: `retryAfter` and the retry delay read an HTTP-date `Retry-After` as well as delta-seconds (the delay stays capped at 30 seconds).
- Node: `can()` metadata accepts string, number and boolean values (the Engine accepts any JSON object).
- Billing handler: the no-subscription 404 `code` is `active_subscription_not_found` (was `subscription_not_found`).
- React: `CheckoutButton` returns to the current page without its query string or hash by default (was the full URL), and shows `errorMessage` (default "We couldn't start checkout. Please try again.") instead of the raw error. `onError` still receives the raw error.

## Node.js 0.20.0 and React 0.18.0 — 2026-10-27

### Added

- A suspended workspace (unpaid Nozle invoices) answers every call with HTTP 402 and `code` `workspace_suspended`. In Node it is a `NozleApiError` (`status` 402, `code`) from `can()`, `track()`, `usage.check()` and every other call, never retried and never turned into an allowed or denied result. The billing handler passes the code to the browser, and the React hooks expose it as `BillingRequestError.code` without retrying. Tests and a README note added.
- `checkout()` and `checkoutInvoice()` accept `cancelUrl` (sent as `cancel_url`): where Stripe sends a customer who leaves the hosted page, validated like `returnUrl`. A return URL may contain `{CHECKOUT_SESSION_ID}`. React: `CheckoutButton` `cancelUrl` and `CreateCheckoutInput.cancelUrl`.

### Changed

- **Breaking:** Stripe checkout is hosted only (Core 11.4.0, Engine 2.12.0). A Stripe `checkout()`, `checkoutInvoice()`, plan change or Entity checkout returns `{ type: "hosted", url, payment_url, checkout_id, ... }`: redirect the customer to `url`. Only a paid upgrade has a status call (`checkoutStatus(plan_upgrade_intent_id, scope)`); a Stripe `checkout_id` is the session id, not a status id, so confirm a new subscription or invoice through webhooks or by reloading billing state. The `type: "stripe"` result and every `client_secret` / `clientSecret` are removed, including on `entitySubscriptions.checkoutMany()` (now `type` `hosted` with `url`). `HostedCheckoutResult` gains `url`.
- **Breaking (React):** the embedded Stripe component is removed. `Checkout` takes only `checkout={result}` and redirects to the hosted page or opens the Razorpay modal; the `clientSecret` / `publishableKey` props, `StripeCheckoutProps`, `toStripeAppearance` and every `onStripeClientSecret` prop (`CheckoutButton`, `UpgradeButton`, `UpgradeModal`, `PricingTable`) are gone. `useCheckoutSession().fetchClientSecret` is now `startCheckout`, which redirects. `@stripe/stripe-js` and `@stripe/react-stripe-js` are no longer peer dependencies.
- The billing portal example no longer reads `STRIPE_PUBLISHABLE_KEY`.
- The `CheckoutResult` family from Node 0.19.0 stays split (`CompletedCheckoutResult`, `ScheduledCheckoutResult`, `HostedCheckoutResult`, `RazorpayCheckoutResult`, `ProcessingCheckoutResult`); the `StripeCheckoutResult` variant is removed, so a Stripe checkout is a `HostedCheckoutResult` (`type: "hosted"`, `url`).

## Node.js 0.19.0 — 2026-10-27

### Added

- `customers.importBillingState(customerId, params, { idempotencyKey })` imports a subscription another system already bills (Core `POST /customers/{customer_id}/billing-state-imports`), and `customers.importCreditBalance(customerId, params, { idempotencyKey })` records its opening credit balance (Engine `POST /customers/{customer_id}/credit-balance-imports`). Both need a secret key and an Idempotency-Key of at most 255 bytes, return the unwrapped import, and throw `NozleApiError` on failure.
- `margin.forecast(params?)` (`GET /margin/forecast`) and `margin.simulate({ metricCode, newPriceDollars }, range?)` (`POST /margin/simulate`), with typed results.
- `costIntelligence.report({ from, to, limit })`, `costIntelligence.previewSharedCostAllocation(poolId, { allocationPeriodStart })` and `costIntelligence.allocateSharedCost(poolId, { allocationPeriodStart })` (Engine `/cost-intelligence/*`, secret keys).
- Root README: a Contributing section (root `npm ci`, how the React tests run).

### Changed (breaking types)

- `CheckoutResult`: the Stripe variant is now `StripeCheckoutResult` and no longer declares `publishable_key`, `stripe_account` or `url`, which Nozle never returns. The `"completed" | "scheduled"` variant is split into `CompletedCheckoutResult` and `ScheduledCheckoutResult`, so narrowing on `type` works. All three are exported. Runtime behaviour is unchanged.
- Root README install pins now name the current releases (Node 0.19.0, React 0.17.0).

## Node.js 0.18.0 — 2026-10-27

### Added

- `plans({ includeHidden })` sends `include_hidden`. With a secret key, `includeHidden: false` returns the pricing table view (without plan families and features hidden from the pricing table), as a publishable key gets. Without the option the request is unchanged.

## React 0.17.0 — 2026-10-27

### Added

- `BillingProvider initialSavedAppearance`: the `meta.sdk_appearance` of a `GET /api/v1/plans` response read on your server. It is used until the catalog request answers, so the first paint and server rendering show the saved theme instead of the default one.

### Changed

- `PricingTable` without `defaultInterval` opens on the interval of `currentPlanCode` when that plan is in the catalog (a yearly subscriber sees Annual and the Current Plan badge on their card), else monthly as before.

## Node.js 0.17.0 — 2026-10-26

### Added

- `can(customerId, feature, metadata?, { subscriptionId?, entityId? })` evaluates one subscription (or one Entity's subscription) of a customer with several. Without a selector, a customer with several current subscriptions gets `allowed: false, reason: "subscription_required"`. The billing handler's `entitlement` route passes `subscription_id` and `entity_id` from its query string; the Engine checks they belong to the signed-in customer.

### Changed

- `track()` with no `subscriptionId` for a customer with no or several active subscriptions now throws `NozleApiError` (status 422, `code` `active_subscription_not_found` or `active_subscription_ambiguous`, the Engine's codes) instead of a plain `Error`. The messages are unchanged.
- `src/generated/openapi.ts`: a description no longer mentions the old `lago_eu_*` tax code.

## React 0.16.0 — 2026-10-26

### Added

- `useEntitlement(feature, { subscriptionId, entityId })` evaluates one subscription or Entity of a customer with several. Needs the billing handler of `@nozle-js/node` 0.17.0.

## Node.js 0.16.0 — 2026-10-24

### Added

- Plan versions. `Plan` has `version` and `is_current`; `plans()` returns current versions only.
- `subscribe(customerId, planCode, { planVersion })` sells a chosen version of the plan code instead of the current one (needs Engine 2.7.0). The same customer and code again keep the subscription's version; another version of an existing subscription throws `NozleApiError` 422 (`plan_version_change_not_supported`), an unknown version 404 (`plan_version_not_found`).
- `client.planVersions` (secret keys): `list(code)` lists every version with its price and active subscriptions, `get(code, version)` reads one, and `previewMigration`, `createMigration`, `listMigrations`, `getMigration` and `cancelMigration` move the subscriptions of one version to another, each at the end of its billing period. Migration items carry `move_status` (`pending`, `moved`, `canceled`). A second migration of a code while one runs throws `NozleApiError` 409 (`plan_version_migration_running`).
- The billing handler's `subscription` route includes `subscription.plan_version`, the version the customer is billed on, and `subscription.entitlements`, that version's entitlements with its usage limits (read from Core with the secret key; `null` when they cannot be read).

## React 0.15.0 — 2026-10-24

### Fixed

- `<CurrentPlan />` showed a customer billed on an older version of the plan the current version's usage limits (the public catalog lists current versions only). With a billing handler from `@nozle-js/node` 0.16.0 it shows the limits of the customer's own version; with a handler that sends the version but not its entitlements, the meters show usage without another version's limits. The pricing table never shows a plan with `is_current: false`, even from a `plans` prop.

### Added

- `PricingPlan.version` and `is_current`, and `BillingSubscription.subscription.plan_version` and `entitlements`.

## Node.js 0.15.0 — 2026-10-23

### Changed

- Node.js: `cancelSubscription(customerId, subscriptionId)` without a timing no longer sends `end_of_period`. It sends no timing, so the organization's cancellation timing applies (new organizations default to `end_of_period`; existing organizations keep their setting). Pass `"end_of_period"` to keep the previous behaviour.

### Added

- Node.js: `cancelSubscription` accepts a `CancelSubscriptionOptions` object (`policy`, `creditAction`, `refundMode`, `finalInvoiceAction`) in place of the timing string. Options left out are not sent and follow the subscription, then the organization's cancellation settings. Needs Engine with nozle-dev/engine#144.

## Node.js 0.14.0 — 2026-10-22

### Added

- `client.managePaymentMethod(customerId, returnUrl?, { idempotencyKey? })` lets a Stripe customer add or replace their saved payment method and returns `ManagePaymentMethodResult` (`url`, `expires_at`, `provider: "stripe"`): redirect the customer to `url`. Needs a secret key. Razorpay customers pay each invoice by payment link, so for them the call throws `NozleApiError` with status 422 and `hasCode("razorpay_pays_by_link")`. Other Engine errors (`invalid_return_url`, `no_linked_payment_provider`, `provider_not_supported`, `missing_payment_provider_customer`) also throw `NozleApiError`.

### Fixed

- `track()` puts its transaction ID on the error it throws (`error.transactionId`, typed on `NozleApiError`), for an error response and for a network error or timeout, including the ID it generated when none was passed. Pass it back as `transactionId` when you retry, with the same event and `timestamp`: Engine records an event once per transaction ID, so the retry no longer bills the event twice. Before, a generated ID was lost when the call threw, and a retry sent a new one.

## React 0.14.0 — 2026-10-22

### Added

- `useManagePaymentMethod()` and `<ManagePaymentMethodButton />` send a Stripe customer to manage their payment method: they call the new `BillingProvider` prop `createManagePaymentMethod` (your backend, which calls `managePaymentMethod` from `@nozle-js/node`), then redirect to `url`. When your backend fails (for a Razorpay customer, `razorpay_pays_by_link`), the hook sets `error` and rethrows, and the button shows the message and calls `onError`.

## Node.js 0.13.1 — 2026-10-19

### Fixed

- `wrapOpenAI` and `wrapAnthropic` no longer change the client passed in. They return a new view of it whose `create` records usage for that wrapper's `customerId`, as the Go SDK returns a copy. Before, each wrap replaced `create` on the shared client, so after wrapping one client for several customers a single call recorded an event for every one of them. Calls on the original client now record nothing, wrapping an already wrapped client wraps its original, and `withResponse()`, `parse()`, `stream()` and streaming keep working and record once. Use the returned client: code that ignored the return value and kept calling the original client no longer records usage.

## React 0.13.0 — 2026-10-19

### Added

- Saved appearance. The theme, colours and pricing table options a merchant saves in the Nozle dashboard (Developers > Customize SDK) reach every component without code. `BillingProvider` reads `meta.sdk_appearance` from the plan catalog request (`GET /api/v1/plans`), the same cached request `PricingTable` and `usePlans` use, so a page makes one call. The saved theme, variables and `planCardLayout` are the lowest layer: `appearance` on `BillingProvider` and on a component win. With nothing saved, or when the request fails, no variables are written and the components look as before. Pass `savedAppearance={false}` on `BillingProvider` to never fetch or apply it.
- `PricingTable` takes `highlightStyle`, `highlightLabel` (an empty saved label means no badge), `annualDiscountLabel` and `showToggle` from the saved options when the props are unset; props win.
- The SDK reads only a closed schema: a theme name (`light`, `dark`, `minimal`, `neobrutal`, `nozle`, `nozleDark`), colour variables as `#rgb` or `#rrggbb`, radius and width variables as `px`, `rem` or `em` lengths, `planCardLayout`, and the four pricing table options. Anything else is ignored, so a saved value never writes free CSS.
- `PlanCard` takes `isUpgrade`, with the same button states as `PricingTable`.
- Saved appearance for a single component. The dashboard can save a theme, variables, card layout and pricing table options for one component (`components.<Name>` in `meta.sdk_appearance`, for example `PricingTable` or `UsageMeter`). They apply to that component only, above the saved global appearance and below `appearance` on `BillingProvider` and on the component. A component rendered inside another (a `UsageMeter` in `UsageDashboard`, an `UpgradeModal` in `UpgradeButton`) uses its own saved settings.

### Changed

- Plan buttons follow the current plan. Without a current plan every plan (except contact sales, which stays outline) gets the primary button, with the theme's `buttonShadow`, and the highlighted plan keeps its highlight colours. With a current plan, plans above it get the primary button, the current plan gets the primary colour without the shadow, and plans at or below it, a highlighted one included, get the secondary button. Before, only the highlighted plan was primary when there was no current plan. In the `panel` layout the "Active" label of the current plan takes the primary colour.
- `BillingProvider` requests the plan catalog (cached, never retried, errors not shown) unless `savedAppearance={false}`, also on pages that only use components such as `UsageMeter`.

## React 0.12.0 — 2026-10-17

### Added

- Plan families in the pricing table. `GET /api/v1/plans` now returns `families` next to `plans`; a family groups the billing intervals of one offer and carries the pricing table settings. `PricingTable` shows one card per family with `show_on_pricing !== false`, ordered by `pricing_position` (unpositioned families last, in API order). A family's cards use its live plans (listed in `plan_codes`, not `pending_deletion`); a family without live plans is hidden. Plans carry `plan_family_code`.
- Interval switch. It offers the intervals of the visible families in the order Weekly, Monthly, Quarterly, Every 6 months, Annual, and is hidden when only one interval exists or with `showToggle={false}`. The new `defaultInterval` prop picks the first interval (`"annual"` is accepted for `"yearly"`); otherwise Monthly when offered, else the first one. Each non-monthly option shows "Save N%" when a family saves against its monthly plan; `annualDiscountLabel` replaces that text on the Annual option. Options with a note have an accessible name such as "Quarterly, save 8%" or "Annual, 2 months free".
- Family cards show prices per month (`$40.83 /mo`) with a billing line such as `Billed $490 yearly · save 17%` or `Billed monthly`. The saving is computed against the family's monthly plan, in integer minor units. A family without a plan for the selected interval shows the plan of the nearest interval with its own billing line.
- Highlight, badge and call to action from the family: `pricing_highlighted` (at most one card), `badge_text` and `cta_text` (default "Get {name}"). `highlightPlan` accepts a family code or a plan code, and `highlightLabel` replaces `badge_text` (default "Most Popular"; `null` shows no badge). The highlighted card follows `highlightStyle` and the theme's `colorHighlight`, and family cards follow a theme's `planCardLayout: "panel"`, with the billing line under the price.
- Features from the family's `features` (`show_on_pricing`, `display_position` then name, `show_description`), with values taken from the selected plan's entitlements (`Projects: 20`, `Storage (GB: 10, Tier: fast)`, `API calls: 100,000` for a metered usage limit; a true boolean privilege adds nothing). A feature the selected plan lacks shows its name. `features` overrides also accept a family code as key, and `{ label, description }` items.
- The CTA, `onSelect` and checkout use the selected interval's plan: `onSelect(plan, family)` and `createCheckout({ planCode: plan.code, … })`.
- `PricingTable` props `families` (with `plans`, instead of fetching), `defaultInterval` and `locale` (default `en-US`; a malformed tag such as `en_US` falls back to `en-US`). `contactSalesPlans` accepts family codes.
- `usePlans()` returns `families` next to `plans`; it is null when the API returns none. `PricingTable` reads them from the same cached catalog request.
- Helpers `getPricingCards(catalog, { interval, locale, highlight, badge, features, contactSales, sort })`, `getAvailableIntervals(catalog)`, `getPricingIntervalOptions(catalog)` and `getDefaultInterval(catalog, preferred?)`, and the types `PricingCatalog`, `PricingFamily`, `PricingFamilyFeature`, `PricingEntitlement`, `PricingPrivilege`, `PricingCard`, `PricingFeature`, `PricingFeatureOverrides`, `PricingInterval`, `PricingIntervalOption` and `GetPricingCardsOptions`.
- APIs that return no `families` key keep working: each live plan is its own card, sorted by price (or `sort`) with `contactSalesPlans` last, the switch filters plans by interval, features are the `planFeatures` lines, and prices are laid out as in 0.11.0: the plan's price per its own interval (`$14.99 /quarter`), with no per-month price or billing line.

### Changed

- Prices use the package's exact minor-unit formatter: no floating-point conversion, the currency's real number of decimals (`¥1,500` for `amount_cents: 1500` in JPY, previously `¥15`), locale-aware symbols and grouping, and no `.00` on whole amounts.
- Plans in other intervals than the current plan's are compared by their cost over a year when choosing the primary button, so a yearly plan is no longer an upgrade only because its price is larger than a monthly one.
- Plans with `pending_deletion: true` are no longer shown.

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
