/** @nozle-js/react — public catalog and merchant-BFF checkout components. */

export {
  BillingProvider,
  BillingContext,
  useBillingContext,
  useOptionalBillingContext,
  useNozleClient,
} from './provider.js';
export type {
  BillingContextValue,
  BillingProviderProps,
  CheckoutResult,
  CompletedCheckoutResult,
  CreateCheckout,
  CreateCheckoutInput,
  NozleClient,
  ScheduledCheckoutResult,
} from './provider.js';

export { usePlans } from './hooks/use-plans.js';
export type { Plan as CatalogPlan } from './hooks/use-plans.js';

export { useCheckout as useCheckoutSession } from './hooks/use-checkout.js';
export type { UseCheckoutResult as UseCheckoutSessionResult } from './hooks/use-checkout.js';

export { PricingTable } from './components/pricing/PricingTable.js';
export type { PricingTableProps, PricingPlan } from './components/pricing/PricingTable.js';

export { PlanCard } from './components/pricing/PlanCard.js';
export type { Plan, PlanCardProps } from './components/pricing/PlanCard.js';

export { PlanComparison } from './components/pricing/PlanComparison.js';
export type {
  ComparisonFeature,
  PlanComparisonProps,
} from './components/pricing/PlanComparison.js';

export { CheckoutButton } from './components/billing/CheckoutButton.js';
export type { CheckoutButtonProps } from './components/billing/CheckoutButton.js';

export { Checkout, useCheckout } from './components/billing/Checkout.js';
export type { CheckoutProps, UseCheckoutResult } from './components/billing/Checkout.js';

export { UpgradeButton } from './components/billing/UpgradeButton.js';
export type { UpgradeButtonProps } from './components/billing/UpgradeButton.js';

export { UpgradeModal } from './components/billing/UpgradeModal.js';
export type { ProrationPreview, UpgradeModalProps } from './components/billing/UpgradeModal.js';

export { FeatureGate } from './components/gates/FeatureGate.js';
export type { FeatureGateProps } from './components/gates/FeatureGate.js';

export { UsageGate } from './components/gates/UsageGate.js';
export type { UsageGateProps } from './components/gates/UsageGate.js';

export { PlanGate } from './components/gates/PlanGate.js';
export type { PlanGateProps } from './components/gates/PlanGate.js';

export { UpgradePrompt } from './components/gates/UpgradePrompt.js';
export type { UpgradePromptProps } from './components/gates/UpgradePrompt.js';

export { LockedOverlay } from './components/gates/LockedOverlay.js';
export type { LockedOverlayProps } from './components/gates/LockedOverlay.js';

export { UsageMeter, getUsageMeterColor } from './components/usage/UsageMeter.js';
export type { UsageMeterProps } from './components/usage/UsageMeter.js';

export { UsageDashboard } from './components/usage/UsageDashboard.js';
export type {
  UsageDashboardProps,
  UsageDashboardFeature,
} from './components/usage/UsageDashboard.js';

export { UsageAlert } from './components/usage/UsageAlert.js';
export type { UsageAlertProps, UsageAlertFeature } from './components/usage/UsageAlert.js';

export { PlanBadge } from './components/billing/PlanBadge.js';
export type { PlanBadgeProps } from './components/billing/PlanBadge.js';

export { PaymentMethodDisplay } from './components/billing/PaymentMethodDisplay.js';
export type {
  PaymentMethodDisplayProps,
  PaymentMethod,
} from './components/billing/PaymentMethodDisplay.js';
