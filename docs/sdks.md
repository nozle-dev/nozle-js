# Nozle SDKs (TypeScript)

Complete reference for @nozle-js/react and @nozle-js/node SDKs.

[← Back to Documentation](./README.md)

---

## Table of Contents

- [Overview](#overview)
- [@nozle-js/react](#nozle-jsreact)
- [@nozle-js/node](#nozle-jsnode)
- [Type Definitions](#type-definitions)
- [Error Handling](#error-handling)

---

## Overview

**Location**: nozle/nozle-js

Two TypeScript SDKs for different environments:

| SDK | Purpose | Environment | Package Size |
|-----|---------|-------------|--------------|
| @nozle-js/react | Billing UI | Client (Browser) | ~15 KB |
| @nozle-js/node | Tracking & API | Server (Node.js) | ~10 KB |

---

## @nozle-js/react

**Location**: @nozle-js/react

Client-side SDK for React applications.

### Installation

```bash
npm install @nozle-js/react react react-dom @stripe/stripe-js @stripe/react-stripe-js
```

**Peer Dependencies**:
- React 18+
- React DOM 18+
- @stripe/stripe-js 5+
- @stripe/react-stripe-js 3+

### Setup

#### 1. Wrap App with BillingProvider

```tsx
import { BillingProvider } from '@nozle-js/react'

export default function RootLayout({ children }) {
  return (
    <BillingProvider
      apiKey={process.env.NEXT_PUBLIC_NOZLE_API_KEY!}
      baseUrl="https://api.nozle.app"  // Optional
      workspaceId="ws_123"              // Optional
      centrifugoUrl="wss://ws.nozle.app/connection/websocket" // Optional
    >
      {children}
    </BillingProvider>
  )
}
```

**Props**:
- `apiKey` (required): Public API key (pk_*)
- `baseUrl` (optional): Engine API URL (default: https://api.nozle.app)
- `workspaceId` (optional): Workspace scoping
- `centrifugoUrl` (optional): WebSocket URL for real-time updates

### Hooks

#### useCan()

Check if customer has access to a feature.

```tsx
import { useCan } from '@nozle-js/react'

function MyFeature() {
  const { allowed, isLoading, error, used, limit, remaining } = useCan('advanced_analytics')

  if (isLoading) return <p>Loading...</p>
  if (error) return <p>Error: {error.message}</p>
  if (!allowed) return <UpgradePrompt />

  return <div>Premium feature content</div>
}
```

**Returns**:
```typescript
{
  allowed: boolean          // Can access feature?
  isLoading: boolean        // Loading state
  error: Error | null       // Error if failed
  reason: string            // Denial reason (if !allowed)
  used: number | null       // Current usage
  limit: number | null      // Usage limit
  remaining: number | null  // Remaining quota
}
```

#### useUsage()

Get real-time usage data for a metric. Updates automatically via WebSocket.

```tsx
import { useUsage } from '@nozle-js/react'

function TokenCounter() {
  const { data, isLoading, error } = useUsage('tokens_used')

  if (isLoading || !data) return null

  return (
    <div>
      <p>{data.used.toLocaleString()} / {data.limit.toLocaleString()} tokens used</p>
      <p>{data.remaining.toLocaleString()} remaining</p>
    </div>
  )
}
```

**Returns**:
```typescript
{
  data: {
    used: number
    limit: number
    remaining: number
    percentage: number  // used/limit * 100
  } | null
  isLoading: boolean
  error: Error | null
}
```

#### usePlan()

Get customer's current plan and subscription status.

```tsx
import { usePlan } from '@nozle-js/react'

function CurrentPlan() {
  const { data, isLoading, error, refetch } = usePlan()

  if (!data) return null

  return (
    <div>
      <p>Plan: {data.plan_slug}</p>
      <p>Status: {data.subscription_status}</p>
      <p>Billing: {data.interval}</p>
      {data.trial_ends_at && (
        <p>Trial ends: {new Date(data.trial_ends_at).toLocaleDateString()}</p>
      )}
    </div>
  )
}
```

**Returns**:
```typescript
{
  data: {
    plan_slug: string
    plan_name: string
    subscription_status: 'active' | 'past_due' | 'canceled' | 'trialing'
    interval: 'monthly' | 'yearly'
    amount_cents: number
    amount_currency: string
    trial_ends_at: string | null
  } | null
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
}
```

#### usePlans()

Fetch all available plans.

```tsx
import { usePlans } from '@nozle-js/react'

function PlanList() {
  const { plans, isLoading, error } = usePlans()

  if (isLoading) return <p>Loading plans...</p>
  if (error) return <p>Error: {error.message}</p>

  return (
    <ul>
      {plans.map((plan) => (
        <li key={plan.code}>
          {plan.name} — ${(plan.amount_cents / 100).toFixed(2)}/{plan.interval}
        </li>
      ))}
    </ul>
  )
}
```

**Returns**:
```typescript
{
  plans: Plan[]
  isLoading: boolean
  error: Error | null
}
```

#### useCheckout()

Create Stripe checkout session.

```tsx
import { useCheckout } from '@nozle-js/react'

function UpgradeButton({ planCode }: { planCode: string }) {
  const { fetchClientSecret, isLoading } = useCheckout()

  const handleUpgrade = async () => {
    try {
      const clientSecret = await fetchClientSecret(planCode)
      // Use clientSecret with Stripe EmbeddedCheckout
      const checkout = await stripe.initEmbeddedCheckout({ clientSecret })
      checkout.mount('#checkout')
    } catch (error) {
      console.error('Checkout failed:', error)
    }
  }

  return (
    <button onClick={handleUpgrade} disabled={isLoading}>
      {isLoading ? 'Loading...' : 'Upgrade'}
    </button>
  )
}
```

#### useSubscribe()

Create subscription after successful payment.

```tsx
import { useSubscribe } from '@nozle-js/react'

function AfterPayment({ planCode }: { planCode: string }) {
  const { subscribe, isLoading } = useSubscribe()

  const handleComplete = async () => {
    await subscribe(planCode)
    // Redirect to dashboard
  }

  return (
    <button onClick={handleComplete} disabled={isLoading}>
      Activate Subscription
    </button>
  )
}
```

### Components

Pre-built UI components with styling included.

#### PricingTable

Renders plan cards in a responsive grid.

```tsx
import { PricingTable } from '@nozle-js/react'

// Auto-fetch plans from API
<PricingTable
  customerId="cust_123"
  highlightPlan="pro"
  onSelect={(plan) => handleUpgrade(plan)}
/>

// Or pass plans explicitly
<PricingTable
  plans={[
    { code: "starter", name: "Starter", amount_cents: 2900, amount_currency: "USD", interval: "monthly" },
    { code: "pro", name: "Pro", amount_cents: 9900, amount_currency: "USD", interval: "monthly" },
  ]}
  features={[
    ["10K API calls", "Email support"],
    ["100K API calls", "Priority support", "Analytics"],
  ]}
  currentPlanCode="starter"
  highlightPlan="pro"
  onSelect={(plan) => console.log("Selected:", plan.code)}
  showToggle={true}
  enterpriseEmail="sales@example.com"
/>
```

**Props**:
- `customerId` (string): Auto-detect current plan
- `plans` (PricingPlan[]): Plans to display (auto-fetched if omitted)
- `features` (string[][]): Feature lists per plan
- `onSelect` (function): Called when plan CTA clicked
- `highlightPlan` (string): Plan to highlight as "Most Popular"
- `currentPlanCode` (string): Explicitly set current plan
- `enterpriseEmail` (string): Email for enterprise "Contact Sales"
- `showToggle` (boolean): Show monthly/annual toggle

#### UsageMeter

Display usage with bar, ring, or minimal variants.

```tsx
import { UsageMeter } from '@nozle-js/react'

<UsageMeter metric="tokens_used" variant="bar" />
<UsageMeter metric="tokens_used" variant="ring" />
<UsageMeter metric="tokens_used" variant="minimal" />
```

**Props**:
- `metric` (string): Metric code to display
- `variant` ('bar' | 'ring' | 'minimal'): Display style

#### PlanBadge

Show current plan with status indicator.

```tsx
import { PlanBadge } from '@nozle-js/react'

<PlanBadge variant="pill" />
<PlanBadge variant="text" />
<PlanBadge variant="icon" />
```

#### UpgradePrompt

Conditionally render upgrade prompt when feature is gated.

```tsx
import { UpgradePrompt } from '@nozle-js/react'

<UpgradePrompt feature="advanced_analytics" variant="card" upgradeUrl="/upgrade" />
<UpgradePrompt feature="advanced_analytics" variant="banner" />
<UpgradePrompt feature="advanced_analytics" variant="inline" />
```

### CSS Theming

Components use CSS custom properties for theming:

```css
:root {
  /* Component-specific */
  --nozle-pricing-bg: #ffffff;
  --nozle-pricing-card-bg: #ffffff;
  --nozle-pricing-highlight: #6366f1;
  --nozle-pricing-border: #e5e7eb;
  --nozle-pricing-radius: 12px;

  /* Global fallbacks */
  --nozle-background: #ffffff;
  --nozle-card: #ffffff;
  --nozle-primary: #6366f1;
  --nozle-border: #e5e7eb;
  --nozle-radius: 12px;
  --nozle-foreground: #111827;
  --nozle-muted-foreground: #6b7280;
}
```

### Tailwind Preset

Optional preset for styling `data-nozle` attributes:

```ts
// tailwind.config.ts
import { nozlePreset } from '@nozle-js/react/styles/preset'

export default {
  presets: [nozlePreset],
}
```

---

## @nozle-js/node

**Location**: @nozle-js/node

Server-side SDK for Node.js applications.

### Installation

```bash
npm install @nozle-js/node
```

**Requirements**: Node.js 18+

### Setup

```typescript
import { Nozle } from '@nozle-js/node'

const nozle = new Nozle({ 
  apiKey: process.env.NOZLE_API_KEY 
})
```

**Config Options**:
```typescript
{
  apiKey: string           // Required: sk_* key
  baseUrl?: string         // Default: https://api.nozle.app
  eventsUrl?: string       // Default: https://lago.nozle.app
  timeout?: number         // Default: 10000ms
}
```

### Core Methods

#### track()

Track usage event.

```typescript
await nozle.track(
  'cust_123',           // customer_id
  'api_call',           // metric_code
  { tokens: 100 }       // properties
)

// With options
await nozle.track('cust_123', 'api_call', { tokens: 100 }, {
  subscriptionId: 'sub_abc',
  transactionId: 'tx_custom_123',
  timestamp: '2025-01-15T10:30:00Z',
})
```

**Parameters**:
- `customerId` (string): Customer external ID
- `metricCode` (string): Billable metric code
- `properties` (object): Event properties
- `options` (optional):
  - `subscriptionId` (string): Explicit subscription
  - `transactionId` (string): Custom transaction ID
  - `timestamp` (string): ISO 8601 timestamp

#### can()

Check if customer has access to a feature.

```typescript
const result = await nozle.can('cust_123', 'code_completion')

if (result.allowed) {
  console.log(`${result.remaining} uses remaining`)
  console.log(`Margin: ${result.margin_per_use_cents} cents`)
} else {
  console.log(`Blocked: ${result.reason}`)
}
```

**Returns**:
```typescript
{
  allowed: boolean
  reason: string
  used: number
  limit: number
  remaining: number
  cost_per_use_cents: number      // Your cost
  revenue_per_use_cents: number   // What you charge
  margin_per_use_cents: number    // Profit per use
  min_margin_percent: number | null
}
```

#### checkAndDeduct()

Atomically check balance and deduct credits.

```typescript
const result = await nozle.checkAndDeduct({
  customerId: 'cust_123',
  feature: 'code_completion',
  credits: 5,
})

if (result.allowed) {
  console.log(`Deducted. Remaining: ${result.remaining}`)
  // Proceed with feature
} else {
  console.log(`Insufficient credits. Balance: ${result.remaining}`)
  // Show upgrade prompt
}
```

**Why Atomic?**:
Prevents race conditions. Uses database-level locking.

#### customers.upsert()

Create or update customer.

```typescript
const customer = await nozle.customers.upsert({
  externalId: 'cust_123',
  name: 'Acme Corp',
  email: 'billing@acme.com',
})
```

#### plans()

Fetch available plans.

```typescript
const plans = await nozle.plans()
plans.forEach(plan => {
  console.log(`${plan.name}: $${plan.amount_cents / 100}/${plan.interval}`)
})
```

#### checkout()

Create Stripe checkout session.

```typescript
const { client_secret, session_id } = await nozle.checkout('cust_123', 'pro')

// Return client_secret to frontend for Stripe Embedded Checkout
```

#### subscribe()

Create subscription after payment.

```typescript
const { subscription_id, status } = await nozle.subscribe('cust_123', 'pro')
```

### LLM Auto-Capture

Automatically track LLM usage by wrapping the client.

#### wrapOpenAI()

```typescript
import OpenAI from 'openai'
import { Nozle, wrapOpenAI } from '@nozle-js/node'

const nozle = new Nozle({ apiKey: process.env.NOZLE_API_KEY })
const openai = wrapOpenAI(new OpenAI(), nozle, {
  customerId: 'cust_123',
  feature: 'code_completion',  // optional: for entitlement tracking
  metricCode: 'llm_tokens',   // optional: defaults to "llm_tokens"
})

// Use OpenAI normally — tracking happens automatically
const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello' }],
})

// Automatically tracked:
// - model: "gpt-4o"
// - input_tokens: 10
// - output_tokens: 20
// - latency_ms: 1200
// - cost_cents: calculated server-side
```

**Streaming also works**:
```typescript
const stream = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello' }],
  stream: true,
})

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || '')
}
// Usage captured from final chunk
```

#### wrapAnthropic()

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { Nozle, wrapAnthropic } from '@nozle-js/node'

const nozle = new Nozle({ apiKey: process.env.NOZLE_API_KEY })
const anthropic = wrapAnthropic(new Anthropic(), nozle, {
  customerId: 'cust_123',
  feature: 'code_completion',
})

// Use Anthropic normally
const message = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello' }],
})

// Automatically tracked with cost calculation
```

### Margin Analytics

Requires secret key (`sk_` prefix).

```typescript
// Summary
const summary = await nozle.margin.summary()
console.log(`Total margin: $${summary.total_margin_cents / 100}`)

// By customer
const byCustomer = await nozle.margin.byCustomer()

// By metric
const byMetric = await nozle.margin.byMetric()

// By plan
const byPlan = await nozle.margin.byPlan()

// By model (LLM usage)
const byModel = await nozle.margin.byModel()

// Time series
const trend = await nozle.margin.trend({ granularity: 'day' })

// With date range
const q1 = await nozle.margin.summary({
  from: '2025-01-01T00:00:00Z',
  to: '2025-03-31T23:59:59Z',
})
```

### Health Check

```typescript
const status = await nozle.ping()
// { ok: true, engine: "ok" }
```

---

## Type Definitions

Both SDKs are fully typed.

### @nozle-js/react

```typescript
import type {
  BillingState,
  UseCanResult,
  UseUsageResult,
  UsePlanResult,
  UseCheckoutResult,
  Plan,
  PricingPlan,
  PricingTableProps,
  UsageMeterProps,
  PlanBadgeProps,
  UpgradePromptProps,
} from '@nozle-js/react'
```

### @nozle-js/node

```typescript
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
} from '@nozle-js/node'
```

---

## Error Handling

### @nozle-js/react

Hooks return errors in the `error` field:

```typescript
const { data, error, isLoading } = useCan('feature')

if (error) {
  console.error('Entitlement check failed:', error.message)
  // Show error UI
}
```

### @nozle-js/node

Methods throw errors:

```typescript
try {
  await nozle.track('cust_123', 'api_call', { count: 1 })
} catch (error) {
  if (error.code === 'ECONNREFUSED') {
    // Network error
  } else if (error.status === 401) {
    // Invalid API key
  } else {
    // Other error
  }
}
```

**Error Types**:
- `NetworkError`: Connection failed
- `APIError`: Server returned error (status, message)
- `ValidationError`: Invalid parameters

---

## Related Documentation

- [Architecture →](./architecture.md)
- [SDK Integration Guide →](./sdk-integration.md)
- [create-nozle-app →](./create-nozle-app.md)

---

**Last Updated**: June 17, 2026
