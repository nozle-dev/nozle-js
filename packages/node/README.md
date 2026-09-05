# @nozle-js/node

Server-side Node.js SDK for usage tracking, entitlement checks, margin intelligence, LLM cost capture, and billing management.

## Install

```bash
npm install @nozle-js/node
```

Works with both JavaScript and TypeScript. Requires Node.js 18+.

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
```

## Configuration

```ts
const nozle = new Nozle({
  apiKey: "sk_live_...",            // Required
  baseUrl: "https://api.nozle.ai",  // Default: http://localhost:8080
  eventsUrl: "https://core.nozle.app", // Default: http://localhost:3000
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
result.economics?.estimated_cost           // Exact decimal string, for example "0.05"
result.economics?.estimated_revenue        // Exact decimal string, for example "0.10"
result.economics?.estimated_margin         // Exact decimal string, for example "0.05"
result.economics?.estimated_margin_percent // Percentage string when revenue is above zero
```

## Credit Check & Deduct

`checkAndDeduct` is a legacy wallet adapter. New product-credit integrations should use `nozle.usage.check()` and `nozle.usage.track()` so metric conversion, source ordering, idempotency, and the immutable ledger remain authoritative.

Advisory checks return exact-decimal `projected_remaining` and ordered
`projected_deductions`. These fields show the source plan without changing a
balance and are suitable for shadow comparisons before a metric canary.

```ts
const result = await nozle.checkAndDeduct({
  customerId: "cust_123",
  feature: "code_completion",
  credits: 5,
});

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
```

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

// Create checkout from an authenticated merchant route.
const checkout = await nozle.checkout(
  "cust_123",
  "pro",
  "https://merchant.example/billing/complete",
);

// Create subscription after payment
const { subscription_id, status } = await nozle.subscribe("cust_123", "pro");
```

### Cancel a subscription

Cancellation is server-only and requires an `sk_` key. The SDK defaults to
end-of-period cancellation, so access remains active until Nozle's authoritative
billing boundary:

```ts
const result = await nozle.cancelSubscription("cust_123", "sub_123");
// result.subscription.status === "active"
// result.subscription.ending_at === "2026-08-15T00:00:00Z"
```

Immediate termination must be requested explicitly:

```ts
await nozle.cancelSubscription("cust_123", "sub_123", "immediate");
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

## License

Proprietary
