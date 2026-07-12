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
      baseUrl="https://api.nozle.app"       // Default: https://api.nozle.app
      workspaceId="ws_123"                   // Optional: workspace scoping
      centrifugoUrl="wss://ws.nozle.app/connection/websocket"  // Optional: real-time updates
    >
      <YourApp />
    </BillingProvider>
  );
}
```

### Required customer app config

For a customer integration, keep the Nozle secret key server-side only. The browser should use the customer's publishable key.

Example Vite env:

```bash
VITE_NOZLE_PUBLISHABLE_KEY=pk_nozle_...
VITE_NOZLE_API_URL=https://api.nozle.app
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

Example Next.js env:

```bash
NEXT_PUBLIC_NOZLE_PUBLISHABLE_KEY=pk_nozle_...
NEXT_PUBLIC_NOZLE_API_URL=https://api.nozle.app
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

Use the Nozle publishable key with `BillingProvider`:

```tsx
<BillingProvider
  publishableKey={import.meta.env.VITE_NOZLE_PUBLISHABLE_KEY}
  baseUrl={import.meta.env.VITE_NOZLE_API_URL}
  customerId={currentCustomerId}
>
  <BillingPortal />
</BillingProvider>
```

Use the Stripe publishable key only when the app mounts embedded Stripe checkout. If you only redirect to a hosted checkout URL, the host app does not need to mount Stripe Elements.

> **Note:** LLM wrappers (`wrapOpenAI`, `wrapAnthropic`) and server-side methods (`checkAndDeduct`, `customers.upsert`) are only available in `@nozle-js/node`. The React SDK is for client-side billing UI only.

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

### `PricingTable`

Renders plan cards in a responsive grid with monthly/annual toggle, current plan detection, and CSS variable theming. Auto-fetches plans from the API if none are provided.

```tsx
import { PricingTable } from "@nozle-js/react";

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
  className="my-pricing"
/>
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `customerId` | `string` | -- | Customer ID for auto-detecting current plan |
| `currentPlanCode` | `string` | -- | Explicitly set current plan (overrides auto-detect) |
| `plans` | `PricingPlan[]` | -- | Plans to display (auto-fetched from API if omitted) |
| `features` | `string[][]` | -- | Feature lists per plan (index-matched to plans array) |
| `onSelect` | `(plan: PricingPlan) => void` | -- | Called when a plan's CTA is clicked |
| `highlightPlan` | `string` | -- | Plan code to highlight as "Most Popular" |
| `enterpriseEmail` | `string` | -- | Email for enterprise plan "Contact Sales" button |
| `showToggle` | `boolean` | `true` | Show monthly/annual toggle (only when annual plans exist) |
| `className` | `string` | -- | CSS class for the outer wrapper |

#### PricingPlan type

```ts
interface PricingPlan {
  code: string;
  name: string;
  amount_cents: number;
  amount_currency: string;
  interval: string;
  description?: string;
}
```

#### CSS Variable Theming

PricingTable uses CSS custom properties for full theming control. Set these on a parent element or `:root`:

```css
:root {
  /* Component-specific overrides */
  --nozle-pricing-bg: #ffffff;
  --nozle-pricing-card-bg: #ffffff;
  --nozle-pricing-highlight: #6366f1;
  --nozle-pricing-border: #e5e7eb;
  --nozle-pricing-radius: 12px;

  /* Or use global Nozle variables (PricingTable falls back to these) */
  --nozle-background: #ffffff;
  --nozle-card: #ffffff;
  --nozle-primary: #6366f1;
  --nozle-border: #e5e7eb;
  --nozle-radius: 12px;
  --nozle-foreground: #111827;
  --nozle-muted-foreground: #6b7280;
  --nozle-muted: #f3f4f6;
  --nozle-primary-foreground: #ffffff;
}
```

The component-specific variables (`--nozle-pricing-*`) take precedence over the global ones (`--nozle-*`), which fall back to sensible defaults.

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
  PricingPlan,
  PricingTableProps,
  UsageMeterProps,
  PlanBadgeProps,
  UpgradePromptProps,
} from "@nozle-js/react";
```

## License

Proprietary
