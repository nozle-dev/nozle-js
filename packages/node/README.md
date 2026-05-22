# @nozle-js/node

Server-side Node.js SDK for usage tracking, entitlement checks, margin intelligence, and billing management.

## Install

```bash
npm install @nozle-js/node
```

Works with both JavaScript and TypeScript. Requires Node.js 18+.

## Quick Start

```ts
import { Nozle } from "@nozle-js/node";

const nozle = new Nozle({ apiKey: "sk_live_..." });

// Track usage event
await nozle.track("cust_123", "tokens_used", { tokens: 150, model: "gpt-4o" });

// Entitlement check
const { allowed, reason, used, limit } = await nozle.can("cust_123", "code_completion");
```

## Configuration

```ts
const nozle = new Nozle({
  apiKey: "sk_live_...",            // Required
  baseUrl: "https://api.nozle.ai",  // Default: http://localhost:8080
  eventsUrl: "https://lago.nozle.ai", // Default: http://localhost:3000
  timeout: 15_000,                   // Default: 10000ms
});
```

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

## Entitlement Checks

```ts
const result = await nozle.can("cust_123", "code_completion");

if (result.allowed) {
  // Feature is available
  console.log(`${result.remaining} uses remaining`);
} else {
  // Blocked: result.reason is "usage_limit_exceeded" or "below_margin_floor"
  console.log(`Blocked: ${result.reason}`);
}
```

Response includes cost intelligence:

```ts
result.cost_per_use_cents    // Your cost per unit
result.revenue_per_use_cents // What you charge per unit
result.margin_per_use_cents  // Revenue minus cost
result.min_margin_percent    // Configured margin floor (if set)
```

## Margin Intelligence

Requires a secret key (`sk_` prefix).

```ts
// Overall margin summary
const summary = await nozle.margin.summary();

// Breakdown by dimension
const byCustomer = await nozle.margin.byCustomer();
const byMetric = await nozle.margin.byMetric();
const byPlan = await nozle.margin.byPlan();
const byModel = await nozle.margin.byModel();

// Trend over time
const trend = await nozle.margin.trend({ granularity: "day" });
const weeklyTrend = await nozle.margin.trend({ granularity: "week" });

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

// Create checkout session (returns Stripe client_secret)
const { client_secret, session_id } = await nozle.checkout("cust_123", "pro");

// Create subscription after payment
const { subscription_id, status } = await nozle.subscribe("cust_123", "pro");
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
} from "@nozle-js/node";
```

## License

Proprietary
