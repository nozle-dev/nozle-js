# @nozle-js/react

React SDK for usage-based billing. Hooks and components for entitlements, real-time usage tracking, plan management, and Stripe checkout.

## Install

```bash
npm install @nozle-js/react
```

Peer dependencies:

```bash
npm install react react-dom @stripe/stripe-js @stripe/react-stripe-js
```

## Quick Start

Wrap your app with `BillingProvider`:

```tsx
import { BillingProvider } from "@nozle-js/react";

function App() {
  return (
    <BillingProvider
      apiKey="pk_live_..."
      customerId="cust_123"
      baseUrl="https://your-api.example.com"
      wsUrl="wss://your-ws.example.com/connection/websocket"
      stripeKey="pk_test_..."
      features={["tokens_used", "code_completions"]}
    >
      <YourApp />
    </BillingProvider>
  );
}
```

## Hooks

### `useCan(feature)`

Check if a customer has access to a feature.

```tsx
import { useCan } from "@nozle-js/react";

function MyFeature() {
  const { allowed, isLoading, error } = useCan("advanced_analytics");

  if (isLoading) return <p>Loading...</p>;
  if (!allowed) return <p>Upgrade to access this feature.</p>;

  return <div>Feature content here</div>;
}
```

### `useUsage(metric)`

Get real-time usage data for a metric. Updates automatically via WebSocket.

```tsx
import { useUsage } from "@nozle-js/react";

function TokenCounter() {
  const { data, isLoading } = useUsage("tokens_used");

  if (isLoading || !data) return null;

  return (
    <p>
      {data.used.toLocaleString()} / {data.limit.toLocaleString()} tokens used
    </p>
  );
}
```

### `usePlan()`

Get the customer's current plan and subscription status.

```tsx
import { usePlan } from "@nozle-js/react";

function CurrentPlan() {
  const { data } = usePlan();

  if (!data) return null;

  return (
    <p>
      Plan: {data.plan_slug} ({data.subscription_status})
    </p>
  );
}
```

### `usePlans()`

Fetch all available plans.

```tsx
import { usePlans } from "@nozle-js/react";

function PlanList() {
  const { plans, isLoading } = usePlans();

  if (isLoading) return <p>Loading plans...</p>;

  return (
    <ul>
      {plans.map((plan) => (
        <li key={plan.code}>
          {plan.name} — ${(plan.amount_cents / 100).toFixed(2)}/{plan.interval}
        </li>
      ))}
    </ul>
  );
}
```

### `useCheckout()`

Create a Stripe checkout session and render embedded checkout.

```tsx
import { useCheckout } from "@nozle-js/react";

function UpgradeButton({ planCode }: { planCode: string }) {
  const { fetchClientSecret, isLoading } = useCheckout();

  const handleUpgrade = async () => {
    const clientSecret = await fetchClientSecret(planCode);
    // Use clientSecret with Stripe EmbeddedCheckout
  };

  return (
    <button onClick={handleUpgrade} disabled={isLoading}>
      Upgrade
    </button>
  );
}
```

### `useSubscribe()`

Create a subscription after successful payment.

```tsx
import { useSubscribe } from "@nozle-js/react";

function AfterPayment({ planCode }: { planCode: string }) {
  const { subscribe, isLoading } = useSubscribe();

  const handleComplete = async () => {
    await subscribe(planCode);
  };

  return (
    <button onClick={handleComplete} disabled={isLoading}>
      Activate Subscription
    </button>
  );
}
```

## Components

Pre-built UI components with built-in styling. No CSS imports needed.

### `UsageMeter`

Displays usage with bar, ring, or minimal variants.

```tsx
import { UsageMeter } from "@nozle-js/react";

<UsageMeter metric="tokens_used" variant="bar" />
<UsageMeter metric="tokens_used" variant="ring" />
<UsageMeter metric="tokens_used" variant="minimal" />
```

### `PlanBadge`

Shows the current plan with status indicator.

```tsx
import { PlanBadge } from "@nozle-js/react";

<PlanBadge variant="pill" />
<PlanBadge variant="text" />
<PlanBadge variant="icon" />
```

### `UpgradePrompt`

Conditionally renders an upgrade prompt when a feature is gated.

```tsx
import { UpgradePrompt } from "@nozle-js/react";

<UpgradePrompt feature="advanced_analytics" variant="card" upgradeUrl="/upgrade" />
<UpgradePrompt feature="advanced_analytics" variant="banner" />
<UpgradePrompt feature="advanced_analytics" variant="inline" />
```

## Tailwind CSS Preset

Optional Tailwind preset for styling the `data-nozle` attributes on components.

```ts
// tailwind.config.ts
import { nozlePreset } from "@nozle-js/react/styles/preset";

export default {
  presets: [nozlePreset],
};
```

## TypeScript

All hooks and components are fully typed. Exported types:

```ts
import type {
  BillingState,
  UseCanResult,
  UseUsageResult,
  UsePlanResult,
  UseCheckoutResult,
  Plan,
  UsageMeterProps,
  PlanBadgeProps,
  UpgradePromptProps,
} from "@nozle-js/react";
```

## License

Proprietary
