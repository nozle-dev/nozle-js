# @nozle-js/node

Feature Event writes use the Go Engine at `https://api.nozle.app/engine/api/v1/events` (batch: `/events/batch`). Configure `baseUrl` for a custom ingestion endpoint. `eventsUrl` configures Core billing resources and subscription discovery.

Server-side Node.js SDK for usage tracking, entitlement checks, margin intelligence, LLM cost capture, and billing management.

## Install

```bash
npm install @nozle-js/node@0.13.0
```

Works with both JavaScript and TypeScript. Requires Node.js 18+.

Version `0.13.0` adds `captureFetch` and `recordUsage` for usage from any LLM client, `createBillingHandler` to serve the React billing hooks, `webhooks.verify` and `createWebhookHandler`, invoices, usage and balance alerts, `currentUsage` and `pastUsage`, a `host` option and retries (`maxRetries`, default 2, safe calls only). `apiKey` is optional and falls back to `NOZLE_SECRET_KEY`, and every failed call throws `NozleApiError`. See the [changelog](../../CHANGELOG.md) and [docs.nozle.dev](https://docs.nozle.dev).

## Quick Start

```ts
import { Nozle } from "@nozle-js/node";

const nozle = new Nozle({ apiKey: "sk_live_..." });

// Track a Feature Event and keep its organization-wide identity.
const transactionId = await nozle.track(
  "cust_123",
  "copilot_action",
  { mode: "planning" },
);

// Add a detailed provider cost to that Feature Event without waiting for it.
await nozle.costEvents.track({
  parentTransactionId: transactionId,
  costMeterCode: "ai_tokens",
  properties: { model: "gpt-5", type: "input", tokens: 150 },
});

// Entitlement check
const { allowed, reason, used, limit } = await nozle.can("cust_123", "code_completion");

// A customer with several subscriptions: say which one (external ids). Without a selector the result is
// { allowed: false, reason: "subscription_required" }.
await nozle.can("cust_123", "seats", undefined, { subscriptionId: "sub_a" }); // or { entityId: "ent_1" }
```

## Configuration

```ts
const nozle = new Nozle({
  apiKey: "sk_live_...",            // Required
  baseUrl: "https://api.nozle.app/engine",  // Default: https://api.nozle.app/engine
  eventsUrl: "https://api.nozle.app/core", // Default: https://api.nozle.app/core
  timeout: 15_000,                   // Default: 10000ms
});
```

## LLM Auto-Capture

Automatically extract model name, token counts, and latency from LLM API responses. No manual tracking needed — the SDK intercepts completions and calls `nozle.track()` for you.

Cost calculation happens server-side via the Go engine's cost model system.

### OpenAI

```bash
npm install openai  # peer dependency, >=4.0.0
```

```ts
import OpenAI from "openai";
import { Nozle, wrapOpenAI } from "@nozle-js/node";

const nozle = new Nozle({ apiKey: "sk_live_..." });
const openai = wrapOpenAI(new OpenAI(), nozle, {
  customerId: "cust_123",
  metricCode: "copilot_action", // customer-facing Feature Event code
  costMeterCode: "ai_tokens",  // optional detailed Cost Events
  feature: "code_completion",  // optional analytics property
});

// Use OpenAI normally — tracking happens automatically
const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello" }],
});

// Streaming works too
const stream = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello" }],
  stream: true,
});
for await (const chunk of stream) {
  // usage is captured from the final chunk
}
```

### Anthropic

```bash
npm install @anthropic-ai/sdk  # peer dependency, >=0.30.0
```

```ts
import Anthropic from "@anthropic-ai/sdk";
import { Nozle, wrapAnthropic } from "@nozle-js/node";

const nozle = new Nozle({ apiKey: "sk_live_..." });
const anthropic = wrapAnthropic(new Anthropic(), nozle, {
  customerId: "cust_123",
  metricCode: "copilot_action",
  costMeterCode: "ai_tokens",
  feature: "code_completion",
});

// Use Anthropic normally
const message = await anthropic.messages.create({
  model: "claude-sonnet-4-20250514",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Hello" }],
});
```

`wrapOpenAI` and `wrapAnthropic` return a new client view and never change the client you pass in, so a server can keep one provider client and wrap it per request:

```ts
const openai = new OpenAI();
app.post("/chat", async (req) => {
  const client = wrapOpenAI(openai, nozle, { customerId: req.team.id });
  return client.chat.completions.create({ model: "gpt-4o", messages: req.body.messages });
});
```

Calls on the original client record nothing.

Each provider call creates one Feature Event. When `costMeterCode` is set, the wrapper generates the Feature Event `transaction_id` before sending and attaches separate detailed Cost Events for `input`, `cached_input`, `cache_write`, `output`, and `reasoning` token categories when present. OpenAI and Anthropic field names are normalized into the same Cost Event properties: `{ tokens, provider, model, type }`. Delivery can arrive out of order because the Cost Event processor resolves the shared `transaction_id` asynchronously.

## Usage Tracking

```ts
// Basic tracking (Engine picks the customer's one active subscription)
await nozle.track("cust_123", "api_call", { tokens: 100 });

// With explicit subscription
await nozle.track("cust_123", "api_call", { tokens: 100 }, {
  subscriptionId: "sub_abc",
});

// With custom transaction ID and timestamp
await nozle.track("cust_123", "api_call", { tokens: 100 }, {
  transactionId: "tx_custom_123",
  timestamp: "2025-01-15T10:30:00Z",
});
```

Subscription resolution: `track()` sends `external_customer_id` and your `subscriptionId` if given; the SDK does no lookup. Without one, Engine uses the customer's one active subscription. If there are several or none, it answers 422 `active_subscription_ambiguous` or `active_subscription_not_found`, thrown as a `NozleApiError` with that `code`: pass `subscriptionId`. `currentUsage()` and `pastUsage()` still look the subscription up (cached for 60 seconds).

`track()` returns the `transactionId`. The SDK generates a UUID version 7 identifier before sending the request when one is not supplied. The identifier is unique across the Nozle organization and can immediately be reused as a Cost Event parent, including when the two requests arrive out of order.

When `track()` throws (an error response, a network error or a timeout), the event may still have been recorded. The error carries the transaction ID as `error.transactionId`, also when the SDK generated it. Retry with that ID and the same event: Engine records an event once per transaction ID, so the retry does not bill it twice. Also pass a `timestamp` and reuse it on the retry: without one, each attempt is stamped with its own arrival time, and Nozle may count two attempts with different timestamps separately.

```ts
const timestamp = new Date().toISOString();
try {
  await nozle.track("cust_123", "api_call", { tokens: 100 }, { timestamp });
} catch (error) {
  const transactionId = (error as { transactionId?: string }).transactionId;
  await nozle.track("cust_123", "api_call", { tokens: 100 }, { transactionId, timestamp });
}
```

```ts
const transactionId = nozle.events.createTransactionId();

await nozle.track("cust_123", "copilot_action", {}, { transactionId });

await nozle.costEvents.track({
  costEventId: nozle.costEvents.createCostEventId(),
  costMeterCode: "ai_tokens",
  parentTransactionId: transactionId,
  requestId: "provider_request_123",
  operationKey: "planning",
  properties: { model: "gpt-5", type: "output", tokens: 900 },
});
```

A Cost Event may instead use `externalCustomerId` without a parent when the cost belongs to a customer but not to one Feature Event. Cost Event methods require a secret key.

### Batching events

`trackBatch()` sends many events through Engine's `/events/batch` in one call. It takes the arguments of `track()` as objects, splits them into requests, sends them in parallel and returns one result per event.

```ts
const result = await nozle.trackBatch([
  { customerId: "cust_123", event: "api_call", metadata: { tokens: 100 } },
  { customerId: "cust_456", event: "api_call", metadata: { tokens: 40 }, timestamp: "2026-10-29T09:30:00Z" },
]);

console.log(result.accepted, result.rejected, result.failed);
for (const r of result.results) {
  if (r.status === "rejected") console.warn(r.index, r.errors); // { code: ["value_is_mandatory"] }
  if (r.status === "failed") console.error(r.index, r.transactionId, r.error); // resend with this transactionId
}
```

The contract:

- **Size.** At most 5000 events per request: the Engine 2.28.0+ default (`LAGO_EVENTS_BATCH_MAX_LENGTH`). `chunkSize` (1 to 5000, default 5000) sets the size of each request, and a longer list is split. `concurrency` (1 to 64, default 4) is how many requests are in flight at once. Each request body is gzipped (`Content-Encoding: gzip`, Engine 2.28.0+); the decoded body limit is 16 MiB. An Engine with a lower cap (before 2.28.0 the default was 100) answers 422 `too_many_events` and stores nothing; the SDK then sends that request in halves until each fits.
- **Result.** `results[i]` belongs to `events[i]` and has a `status`: `accepted` (stored), `rejected` (Engine refused this event; `errors` maps a field to codes, and resending it unchanged fails again) or `failed` (its request failed: `error` is a `NozleApiError`, a network error or a timeout, and the event may or may not be stored). `accepted`, `rejected`, `failed` and `total` count them. `trackBatch()` throws only for invalid arguments; a failed request never hides the results of the others.
- **Partial acceptance.** Engine 2.28.0+ stores the valid events of a request and answers 200 with `error_details` naming each refused event by position: an invalid event, a `transactionId` already stored with other values, or an event of a customer whose payment is overdue (`customer_payment_overdue`). The SDK marks those `rejected` and the others `accepted`. A request that stores nothing (every event refused, or an Engine before 2.28.0, which refuses a whole request for one bad event) answers 422 or 402 naming the bad events; the SDK marks those `rejected` and resends the valid rest (at most 3 requests for one chunk), so one bad event costs its own result only. A 5xx or network error still fails the whole request; it is retried as below.
- **Idempotency.** Every event has a `transactionId`: yours, or a generated UUID version 7 that is also returned in `results[i].transactionId`. Engine records an event once per transaction ID, so the SDK retries a request after a network error, timeout, 429 or 5xx (`maxRetries`, default 2) without storing an event twice. IDs must be unique in one call (`NozleValidationError` otherwise). To retry `failed` events yourself, pass the same `transactionId` and the same `timestamp`.
- **Timestamps.** Each event keeps its own `timestamp` (RFC 3339 or Unix seconds); without one Engine stamps it on arrival. There is no backfill flag: `/events/batch` accepts old and future timestamps as sent. It does not apply the 24 hours ahead and 366 days back window that `usage.track()` and cost events enforce.
- **Subscription.** As for `track()`, pass `subscriptionId` or let Engine resolve the customer's one active subscription. A customer with several or none is a 422 for that event, so it comes back `rejected`.
- **Invalid arguments** (`NozleValidationError` with the event's `index`, before any request): a missing `customerId` or `event`, a bad `timestamp`, a repeated `transactionId`, or an out-of-range `chunkSize` or `concurrency`.

`trackBatch()` is not `usage.track()`: it records events like `track()` does and does not deduct credits, apply a money-billed feature's checks or return a balance. A list of 0 events sends nothing. There is no client-side buffer yet; to batch events as they happen, collect them and call `trackBatch()`.

## Entitlement Checks

```ts
const result = await nozle.can("cust_123", "code_completion");

if (result.allowed) {
  console.log(`${result.remaining} uses remaining`);
} else {
  console.log(`Blocked: ${result.reason}`);
}
```

Response includes cost intelligence:

```ts
result.economics?.estimated_incremental_cost    // Exact decimal string, for example "0.05"
result.economics?.estimated_incremental_revenue // Exact decimal string, for example "0.10"
result.economics?.estimated_incremental_margin  // Exact decimal string, for example "0.05"
result.economics?.estimated_margin_percent      // Percentage string when revenue is above zero
result.policy?.decision                         // "allow", "warn", or "deny"
```

## Credit Check & Deduct

`checkAndDeduct` is a legacy wallet adapter. New product-credit integrations should use `nozle.usage.check()` and `nozle.usage.track()` so metric conversion, source ordering, idempotency, and the immutable ledger remain authoritative.

Advisory checks return exact-decimal `projected_remaining` and ordered
`projected_deductions`. These fields show the source plan without changing a
balance and are suitable for shadow comparisons before a metric canary.

```ts
const result = await nozle.checkAndDeduct({
  customerId: "cust_123",
  credits: 5,
});

// `feature` is deprecated: it is accepted for old callers but never sent.
if (result.allowed) {
  console.log(`Deducted. Remaining: ${result.remaining}`);
} else {
  console.log(`Insufficient credits. Balance: ${result.remaining}`);
}
```

## Customer Management

Customer writes go directly to Nozle Core using the merchant's secret key, so
Core derives the owning organization from that key.

```ts
// Create or update a customer
const customer = await nozle.customers.upsert({
  externalId: "cust_123",
  name: "Acme Corp",
  email: "billing@acme.com",
});

// Link a customer that already exists in Stripe, without creating a new one
await nozle.customers.upsert({
  externalId: "cust_123",
  billingConfiguration: {
    paymentProvider: "stripe",
    paymentProviderCode: "stripe_main",
    providerCustomerId: "cus_ABC123",
  },
});
```

A payment provider assignment needs `providerCustomerId` or `syncWithProvider: true`; otherwise Core drops it. The same applies to `provider_customer_id` and `sync_with_provider` when you call the REST API directly.

### Importing billing state and opening credit balances

When you move customers from another billing system, import each subscription that system still bills, then its current credit balance. Both calls need a secret key and an `idempotencyKey` (at most 255 bytes): retry an uncertain call with the same key and the same body. `dryRun: true` validates without writing.

```ts
const imported = await nozle.customers.importBillingState(
  "workspace_123",
  {
    subscription: {
      planCode: "pro_monthly",
      status: "active",
      billingAuthority: "external",
      externalReference: "merchant_subscription_123",
      currentPeriodStart: "2026-10-15T00:00:00Z",
      currentPeriodEnd: "2026-11-15T00:00:00Z",
    },
  },
  { idempotencyKey: "import-workspace_123-state" },
);

await nozle.customers.importCreditBalance(
  "workspace_123",
  {
    externalSubscriptionId: imported.subscription.external_subscription_id!,
    creditSystemCode: "ai_credits",
    grantedAmount: "500",
    remainingAmount: "320",
  },
  { idempotencyKey: "import-workspace_123-credits" },
);
```

Failures throw `NozleApiError`; for example `error.code === "idempotency_key_reused"` when a key is reused with a different body.

## Product credits

Read exact-decimal balances and immutable operation history from the Phase 1 credit engine:

```ts
const balance = await nozle.credits.getBalance("cust_123", "ai_credits");
const page = await nozle.credits.listOperations("cust_123", {
  creditSystemCode: "ai_credits",
  limit: 25,
});
```

Keep these reads on the merchant backend. Return only the fields your authenticated browser route needs, and derive the customer from the logged-in user or team instead of trusting a browser customer ID.

## Entities and per-user credits

Use Entities for stable customer-owned subjects such as workspace users. Entity mutations require a server-side secret key and a caller-supplied idempotency key.

```ts
await nozle.entities.upsert(
  "workspace_123",
  "user_42",
  { name: "Asha", status: "active", metadata: { role: "agent" } },
  { idempotencyKey: "entity-user-42-v1" },
);

const entities = await nozle.entities.list("workspace_123", {
  status: "active",
  limit: 50,
});

const balance = await nozle.credits.getEntityBalance(
  "workspace_123",
  "user_42",
  "ai_credits",
);

console.log(balance.entity_available);
console.log(balance.shared_available);
console.log(balance.effective_available);
```

## Entity subscription checkout

Create one payment for a mixed basket of Entity plans from your trusted backend:

```ts
const checkout = await nozle.entitySubscriptions.checkoutMany("workspace_123", {
  billingTime: "anniversary",
  returnUrl: "https://app.example.com/settings/billing",
  idempotencyKey: "workspace-123-seat-purchase-v1",
  items: [
    { externalEntityId: "seat_pro_001", planCode: "pro_monthly" },
    { externalEntityId: "seat_max_001", planCode: "max_monthly" },
  ],
});
```

For Stripe the result is `type: "hosted"`: redirect the customer to `checkout.url`. After they return, confirm the outcome as described under
"Payment providers" below (a Stripe `checkout_id` is not a status id). Never expose the secret Nozle key
to the browser.

Allocation and deallocation preserve exact decimal strings, source provenance, and expiry. They are backend-only operations and may also be disabled by the Engine's exact organization/Credit System rollout gate.

```ts
await nozle.credits.allocate(
  "workspace_123",
  "user_42",
  { creditSystemCode: "ai_credits", amount: "100.000000000001" },
  { idempotencyKey: "allocate-user-42-100" },
);

await nozle.usage.track(
  {
    customerId: "workspace_123",
    entityId: "user_42",
    featureCode: "agent_execution",
    creditSystemCode: "ai_credits",
  },
  { idempotencyKey: "execution-0183f" },
);
```

Keep the same idempotency key when retrying an uncertain mutation result. Never convert credit amounts to JavaScript numbers.

## Workspace suspended or card required (402)

When your Nozle workspace is suspended because its Nozle invoices are unpaid, every API call answers HTTP 402 with `code` `workspace_suspended`. A workspace without a verified card answers 402 with `code` `card_required` the same way. `NozleApiError` has `status` 402 and `code` `workspace_suspended`, from `can()`, `track()`, `usage.check()` and every other call; `can()` throws it instead of returning `allowed: false`. `createBillingHandler` passes the code to the browser.

```ts
try {
  await nozle.can("cust_123", "code_completion");
} catch (error) {
  if (error instanceof NozleApiError && error.code === "workspace_suspended") {
    // Tell your team to pay the Nozle invoices; do not treat this as allowed or denied.
  }
}
```

Never retry blindly: the SDK does not retry a 402. Add a card in the Nozle dashboard (`card_required`) or pay the Nozle invoices (`workspace_suspended`) and calls work again at once. Events sent during the suspension are refused, not queued.

## Customer payment overdue (402)

When one of your customers leaves invoices unpaid past the plan's grace (your dunning settings), Nozle refuses that customer's usage with HTTP 402 and `code` `customer_payment_overdue` until the invoices are paid. Other customers are not affected.

- `can()` returns `{ allowed: false, reason: "customer_payment_overdue", used: 0, limit: null, remaining: null }` instead of throwing. Show the customer that a payment is overdue and link to your billing page.
- `track()`, `usage.check()` and `usage.track()` throw `NozleApiError` with `status` 402; `error.hasCode(CUSTOMER_PAYMENT_OVERDUE)` is true. Nothing is recorded.
- `/events/batch` stores the other customers' events and answers 200 with `error_details` keyed by the index of each refused event (`EventBatchResponse`); `refusedEventIndexes(body.error_details, CUSTOMER_PAYMENT_OVERDUE)` lists them. When every event is refused it answers 402 and stores nothing; `error.refusedEventIndexes(CUSTOMER_PAYMENT_OVERDUE)` lists them on the `NozleApiError`.
- The LLM proxy answers 402 with `code` `customer_payment_overdue` for the `X-Nozle-Customer-Id` customer before the provider is called. `isCustomerPaymentOverdue(error)` is true for that error from the Anthropic SDK (it keeps the body in `error`) and for a `NozleApiError`. The OpenAI SDK drops a top-level `code`; with it, call `can()` before the request to read the reason.

```ts
import { CUSTOMER_PAYMENT_OVERDUE, refusedEventIndexes, type EventBatchResponse } from "@nozle-js/node";

const { allowed, reason } = await nozle.can("cust_123", "code_completion");
if (reason === CUSTOMER_PAYMENT_OVERDUE) {
  // Ask the customer to pay the open invoice.
}

const res = await fetch(`${nozleUrl}/api/v1/events/batch`, { method: "POST", headers, body: JSON.stringify({ events }) });
const body = (await res.json()) as EventBatchResponse;
const refused = refusedEventIndexes(body.error_details, CUSTOMER_PAYMENT_OVERDUE); // stored: every other event
```

## Webhooks

`nozle.webhooks.verify({ body, headers, secret })` checks a delivery against the raw body and returns the parsed event, or throws `WebhookVerificationError`. Pass the endpoint's `whsec_` secret; during a rotation pass both secrets as an array. The check uses `webhook-id`, `webhook-timestamp` and `webhook-signature`, rejects timestamps more than 300 seconds off (`toleranceSeconds` changes this) and makes no network call.

```ts
import { createWebhookHandler } from "@nozle-js/node";

export const POST = createWebhookHandler(nozle, {
  secret: process.env.NOZLE_WEBHOOK_SECRET,
  onEvent: async (event) => { /* event.id is the same on every retry: skip duplicates */ },
});
```

## Health Check

```ts
const status = await nozle.ping();
// { ok: true, engine: "ok" }
```

## Margin Intelligence

Requires a secret key (`sk_` prefix).

```ts
const summary = await nozle.margin.summary();
const byCustomer = await nozle.margin.byCustomer();
const byMetric = await nozle.margin.byMetric();
const byPlan = await nozle.margin.byPlan();
const byModel = await nozle.margin.byModel();
const trend = await nozle.margin.trend({ granularity: "day" });
const forecast = await nozle.margin.forecast(); // next 30 days, from the last month's daily trend
const simulation = await nozle.margin.simulate({ metricCode: "agent_execution", newPriceDollars: 1 });

// With time range
const q1 = await nozle.margin.summary({
  from: "2025-01-01T00:00:00Z",
  to: "2025-03-31T23:59:59Z",
});
```

### Cost Intelligence

```ts
const report = await nozle.costIntelligence.report({ from: "2026-10-01T00:00:00Z", limit: 50 });
const preview = await nozle.costIntelligence.previewSharedCostAllocation(poolId, {
  allocationPeriodStart: "2026-10-01T00:00:00Z",
});
// Books a closed period now; Nozle also books it within about 15 minutes of the close.
const run = await nozle.costIntelligence.allocateSharedCost(poolId, { allocationPeriodStart: "2026-10-01T00:00:00Z" });
```

## Plans & Checkout

```ts
// List available plans
const plans = await nozle.plans();
// The pricing table view: without plan families and features hidden from it
const visible = await nozle.plans({ includeHidden: false });

// Create checkout from an authenticated merchant route.
const checkout = await nozle.checkout(
  "cust_123",
  "pro",
  "https://merchant.example/billing/complete",
);

// Create subscription after payment
const { subscription_id, status } = await nozle.subscribe("cust_123", "pro");
```

### Currencies

A plan family can be sold in several currencies, one plan per interval and currency. With a secret key, `plans()` lists every plan in every currency; `plans({ currency })` lists only that currency, and `plans({ externalCustomerId })` only the customer's locked currency (ignored when your organization allows several currencies per customer). A publishable key without `currency` gets each family's default-currency plans, as the React pricing table shows them. A family plan carries `family` (`code`, `currencies`, `default_currency`) and `prices` (every variant: `currency`, `interval`, `plan_code`, `amount_cents`). An unknown currency is a 422.

`checkout()` and `subscribe()` take `{ planFamilyCode, interval, currency }` instead of a plan code; Core picks the variant. Without `currency` it uses the customer's locked currency, else the family's default. Needs Core 11.10.0.

```ts
const eurPlans = await nozle.plans({ currency: "EUR" });
await nozle.checkout("cust_123", { planFamilyCode: "pro", interval: "yearly", currency: "EUR" }, returnUrl);
```

### Plan versions

Changing the price of a plan that customers pay for saves it as the plan's next version: new customers get the new version, and existing subscribers keep the price they bought until you move them. `plans()` returns current versions only; each plan has `version` and `is_current`.

```ts
// Keep selling the older price to one customer.
await nozle.subscribe("cust_123", "pro", { planVersion: 1 });

const versions = await nozle.planVersions.list("pro"); // every version, its price and active subscriptions
const older = await nozle.planVersions.get("pro", 1);

// Move version 1's subscribers to the current version, each at the end of its billing period.
const preview = await nozle.planVersions.previewMigration("pro", { fromVersion: 1 });
const migration = await nozle.planVersions.createMigration("pro", { fromVersion: 1 });
const detail = await nozle.planVersions.getMigration("pro", migration.nozle_id); // per-subscription items
await nozle.planVersions.cancelMigration("pro", migration.nozle_id); // unschedules moves not started
```

A migration invoices, credits and refunds nothing when it runs: each subscription is billed the new version from its next period. Subscriptions it cannot move (custom pricing, a trial the new version would change, a pending plan change, an open checkout, and so on) are skipped with a `skip_reason`. Sending the same plan code again for an existing subscription keeps its version; another `planVersion` for it is refused. `planVersions` needs a secret key. See [Plan versioning](https://docs.nozle.dev/guides/billing/plan-versions).

### Payment providers: Stripe and Razorpay

Nozle collects through the payment provider connected to your organization and assigned to the customer. `checkout()` and `checkoutInvoice()` return a result whose `type` tells you what to do next. Branch on `type`; a browser callback alone never proves payment.

| `type` | Provider | Next step |
| --- | --- | --- |
| `hosted` | Stripe, Razorpay link | Redirect the customer to `url` (the Stripe Checkout page; `payment_url` is the same address), then confirm as described below (Stripe: `checkout_id` is the Stripe session id, not a status id) |
| `razorpay` | Razorpay | Open the Razorpay modal with `key_id`, `order_id`, `amount_cents` and `currency`, then verify |
| `processing` | Razorpay or Stripe | Recover with `checkoutStatus(checkout_id)` instead of starting another checkout. Razorpay returns it while the order is not ready; Stripe returns it when a quoted upgrade is replayed while its webhook is still pending |
| `completed`, `scheduled` | Either | No payment is due now. Credits covered it, or the change takes effect later |

**Stripe.** Every Stripe checkout is the Stripe-hosted Checkout page; there is no embedded form. `checkout_id` of a Stripe result is the Stripe session id (`cs_...`); `checkoutStatus` does not accept it. An upgrade session lasts 35 minutes, an Entity batch 23 hours. Redirect the customer to `url`. Pass `cancelUrl` in the options to choose where Stripe sends a customer who leaves the page (validated like `returnUrl`, defaults to it). A return URL may contain the literal `{CHECKOUT_SESSION_ID}`, which Stripe replaces with the Checkout Session id. Credit top-up purchases also return a Stripe-hosted `payment_url` (valid for 24 hours).

```ts
import { Nozle } from "@nozle-js/node";

const nozle = new Nozle({ apiKey: process.env.NOZLE_SECRET_KEY! });
const returnUrl = "https://app.example.com/settings/billing";

const result = await nozle.checkout("cust_123", "pro_monthly", returnUrl, {
  cancelUrl: "https://app.example.com/pricing",
});
if (result.type === "hosted") {
  // Redirect the customer to result.url.
  // Paid upgrade (result.plan_upgrade_intent_id): after they return, poll
  //   nozle.checkoutStatus(result.plan_upgrade_intent_id, { customerId, subscriptionId });
  //   status is awaiting_payment (hosted nested), processing, succeeded or expired.
  // New subscription or invoice (result.invoice_id): there is no status call. The customer
  //   returns to your return URL; confirm with the invoice.payment_succeeded or subscription
  //   webhook, or by reloading billing state (can() or the subscription read).
}
```

A new-subscription checkout retried while the first attempt is unpaid reopens payment for the same invoice when the plan is the same (or returns `completed` if it was paid meanwhile). For another plan, the unpaid attempt is expired and replaced, or the request gets HTTP 409 `subscription_checkout_in_progress` (`entity_subscription_checkout_in_progress` for an Entity checkout) when it cannot be expired yet. Keep the body identical for one idempotency key: a different request with the same key gets HTTP 409 `idempotency_key_reused`, including an invoice checkout. Checkout error bodies carry `status`, `error` and `code`.

**Razorpay.** Razorpay supports only INR. Return the `razorpay` result to the browser, open the modal there, and post the handler's three fields back to your backend. `verifyCheckout()` sends them to Nozle, which checks the signature and fetches the payment from Razorpay; the SDK does not check the signature locally. Verify and status need an `sk_` key.

```ts
// Backend: create. `checkout` is { type: "razorpay", checkout_id, key_id, order_id,
// amount_cents (paise), currency: "INR", expires_at, invoice_id | plan_upgrade_intent_id }.
const checkout = await nozle.checkout("cust_123", "pro_monthly", returnUrl, {
  idempotencyKey: "checkout-cust_123-pro_monthly-v1",
  // registerMandate: true, // UPI AutoPay; the result then also has customer_id,
  //                       // recurring and mandate_max_amount_cents
});
if (checkout.type !== "razorpay") throw new Error("not a Razorpay checkout");

// Browser (after loading https://checkout.razorpay.com/v1/checkout.js):
//   new window.Razorpay({ key: checkout.key_id, order_id: checkout.order_id,
//     amount: checkout.amount_cents, currency: checkout.currency, handler }).open()
// For a mandate also pass customer_id: checkout.customer_id and recurring: "1".

// Backend: verify what the handler returned (`body` is the JSON your browser posted),
// then poll until both statuses succeed.
const scope = { customerId: "cust_123", subscriptionId: "sub_123" };
await nozle.verifyCheckout(checkout.checkout_id, {
  razorpay_order_id: body.razorpay_order_id,
  razorpay_payment_id: body.razorpay_payment_id,
  razorpay_signature: body.razorpay_signature,
}, scope);
const status = await nozle.checkoutStatus(checkout.checkout_id, scope);
// status.status: awaiting_payment | processing | succeeded | failed | expired | needs_review
// Show success only when status.status and status.fulfillment_status are both "succeeded".
```

Bind each `checkout_id` to the buyer who started it before you call verify or status. Pass both scope fields to tie a call to one customer and subscription.

Provider errors are `NozleApiError` instances with `status`, `code` and `errorDetails`. `hasCode()` matches the top-level code and the codes listed in `error_details`, for example `razorpay_requires_inr`, `payment_provider_required` or `invalid_checkout_signature`.

```ts
import { NozleApiError } from "@nozle-js/node";

try {
  await nozle.checkout("cust_123", "pro_monthly", returnUrl);
} catch (error) {
  if (error instanceof NozleApiError && error.hasCode("razorpay_requires_inr"))
    // Price the plan in INR for customers who pay through Razorpay.
    return;
  throw error;
}
```

See the [Stripe](https://docs.nozle.dev/integrations/stripe) and [Razorpay](https://docs.nozle.dev/integrations/razorpay) integration guides for connection setup, webhooks, and limits.

### Cancel a subscription

Cancellation is server-only and requires an `sk_` key. Without a timing, the
organization's cancellation timing applies (set in the dashboard; new organizations default to `end_of_period`;
existing organizations keep their setting). Pass the timing to choose it per call:

```ts
const result = await nozle.cancelSubscription("cust_123", "sub_123", "end_of_period");
// result.subscription.status === "active"
// result.subscription.ending_at === "2026-08-15T00:00:00Z"
```

Pass an options object to also choose how the cancellation is settled. Each option left
out follows the subscription, then the organization's cancellation settings:

```ts
await nozle.cancelSubscription("cust_123", "sub_123", {
  policy: "immediate",
  creditAction: "refund", // credit, refund, offset or none
  refundMode: "prorated", // prorated or full
  finalInvoiceAction: "generate", // generate or skip
});
```

## TypeScript

All methods and responses are fully typed. Exported types:

```ts
import type {
  NozleConfig,
  TrackOptions,
  CanResult,
  Plan,
  CheckoutResult,
  CheckoutStatus,
  RazorpayCheckoutResult,
  SubscribeResult,
  MarginQueryParams,
  TrendParams,
  PingResult,
  CustomerUpsertParams,
  CustomerUpsertResult,
  CheckAndDeductParams,
  CheckAndDeductResult,
  WrapOptions,
} from "@nozle-js/node";
```

## React billing portal subscription management

See the [runnable authenticated merchant integration](../../examples/billing-portal/README.md) for Cancel, Keep, payment-backed upgrades, scheduled downgrades, and exact pending-change withdrawal through the React billing portal. It reuses the existing transition methods and derives customer identity from the merchant session. For end-of-period cancellation, optional `expectedEffectiveAt` preserves the exact preview timestamp and rejects a changed date atomically on compatible Engine/Core deployments. Existing calls without this option remain compatible.


Version `0.9.0` adds `subscriptionOptions(customerId, subscriptionId)`,
`previewSubscriptionChange(customerId, subscriptionId, planCode)`, and
`withdrawPendingSubscriptionChange(customerId, subscriptionId, pendingSubscriptionId, idempotencyKey)`.
Use the existing checkout/transition methods with the selected subscription, signed quote,
and a stable action key. Scope `checkoutStatus` and `verifyCheckout` with both customer and
subscription identifiers. See the [method examples](https://docs.nozle.dev/sdks/node/billing#subscription-self-service).

## License

MIT. See [LICENSE](LICENSE).
