# @nozle-js/node

Feature Event writes use the Go Engine at `https://api.nozle.app/engine/api/v1/events` (batch: `/events/batch`). Configure `baseUrl` for a custom ingestion endpoint. `eventsUrl` configures Core billing resources and subscription discovery.

Server-side Node.js SDK for usage tracking, entitlement checks, margin intelligence, LLM cost capture, and billing management.

## Install

```bash
npm install @nozle-js/node@0.13.0
```

Works with both JavaScript and TypeScript. Requires Node.js 18+.

Version `0.13.0` adds `captureFetch` and `recordUsage` for usage from any LLM client, `createBillingHandler` to serve the React billing hooks, `webhooks.verify` and `createWebhookHandler`, invoices, usage and balance alerts, `currentUsage` and `pastUsage`, a `host` option and opt-in retries. `apiKey` is optional and falls back to `NOZLE_SECRET_KEY`, and every failed call throws `NozleApiError`. See the [changelog](../../CHANGELOG.md) and [docs.nozle.dev](https://docs.nozle.dev).

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
// Basic tracking (auto-resolves subscription)
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

Subscription auto-resolution: if no `subscriptionId` is provided, the SDK looks up the customer's active subscription and caches it for subsequent calls.

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

Return the result to your frontend and mount `checkout.client_secret` with the
`Checkout` component from `@nozle-js/react`. Never expose the secret Nozle key
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

// With time range
const q1 = await nozle.margin.summary({
  from: "2025-01-01T00:00:00Z",
  to: "2025-03-31T23:59:59Z",
});
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
| `stripe` | Stripe | Send `client_secret` (a `cs_` embedded Checkout Session secret) to the browser |
| `razorpay` | Razorpay | Open the Razorpay modal with `key_id`, `order_id`, `amount_cents` and `currency`, then verify |
| `hosted` | Razorpay | Declared in the result types; `POST /checkout` does not return it for Razorpay. Invoice payment URLs and credit top-ups return a `payment_url` (an rzp.io payment link) with no checkout id to poll |
| `processing` | Razorpay or Stripe | Recover with `checkoutStatus(checkout_id)` instead of starting another checkout. Razorpay returns it while the order is not ready; Stripe returns it when a quoted upgrade is replayed while its webhook is still pending |
| `completed`, `scheduled` | Either | No payment is due now. Credits covered it, or the change takes effect later |

**Stripe.** Plan and invoice checkout always create an embedded Checkout Session. They never return a Stripe-hosted URL or your Stripe publishable key, so the browser needs the `pk_` key for the Stripe account connected in Nozle (the React `Checkout` component takes it as `publishableKey`). Credit top-up purchases are different: they return a Stripe-hosted `payment_url` (`checkout.stripe.com`, valid for 24 hours).

```ts
import { Nozle } from "@nozle-js/node";

const nozle = new Nozle({ apiKey: process.env.NOZLE_SECRET_KEY! });
const returnUrl = "https://app.example.com/settings/billing";

const result = await nozle.checkout("cust_123", "pro_monthly", returnUrl);
if (result.type === "stripe") {
  // Return the secret to the browser and mount Stripe Embedded Checkout with it.
  const clientSecret = result.client_secret ?? result.clientSecret;
  // A new subscription has no checkout ID to poll: reload the subscription after
  // Embedded Checkout completes. A paid upgrade carries plan_upgrade_intent_id.
}
```

Idempotency keys have two Stripe edge cases today. A new-subscription checkout retried while the subscription is still `incomplete` fails with HTTP 422 `validation_errors` containing `subscription_incomplete`, even with the same key; recover by calling `checkoutInvoice()` with the `invoice_id` from the first response. An invoice checkout retried with the same key and a different body currently returns HTTP 500, not 409, so keep the body identical for one key.

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
