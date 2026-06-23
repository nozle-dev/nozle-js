/**
 * @nozle-js/react — React hooks for the Nozle billing SDK.
 * Main entry point — re-exports all public components and hooks.
 */

export { BillingProvider, BillingContext, useBillingContext, useNozleClient } from './provider.js';
export type { BillingContextValue, BillingProviderProps, NozleClient } from './provider.js';

export { useCan } from './hooks/use-can.js';
export type { CanState } from './hooks/use-can.js';

export { useUsage } from './hooks/use-usage.js';
export type { UsageState } from './hooks/use-usage.js';

export { useCredits } from './hooks/use-credits.js';
export type { CreditsState } from './hooks/use-credits.js';

export { usePlan } from './hooks/use-plan.js';
export { usePlans } from './hooks/use-plans.js';

// UI-01: Billing portal wrapper + pricing components
export {
  BillingPortalProvider,
  useBillingPortal,
} from './components/billing/BillingPortalProvider.js';
export type {
  BillingPortalContextValue,
  BillingPortalProviderProps,
} from './components/billing/BillingPortalProvider.js';

export { PricingTable } from './components/pricing/PricingTable.js';
export type { PricingTableProps, PricingPlan } from './components/pricing/PricingTable.js';


export { PlanCard } from './components/pricing/PlanCard.js';
export type { Plan, PlanCardProps } from './components/pricing/PlanCard.js';

export { PlanComparison } from './components/pricing/PlanComparison.js';
export type {
  ComparisonFeature,
  PlanComparisonProps,
} from './components/pricing/PlanComparison.js';

// UI-02: Billing action buttons + upgrade modal
export { CheckoutButton } from './components/billing/CheckoutButton.js';
export type { CheckoutButtonProps } from './components/billing/CheckoutButton.js';

// UI-CHECKOUT: Stripe Elements drop-in checkout component
export { Checkout, useCheckout } from './components/billing/Checkout.js';
export type { CheckoutProps, UseCheckoutResult } from './components/billing/Checkout.js';

export { UpgradeButton } from './components/billing/UpgradeButton.js';
export type { UpgradeButtonProps } from './components/billing/UpgradeButton.js';

export { CreditTopUpButton } from './components/billing/CreditTopUpButton.js';
export type { CreditTopUpButtonProps } from './components/billing/CreditTopUpButton.js';

export { UpgradeModal } from './components/billing/UpgradeModal.js';
export type { ProrationPreview, UpgradeModalProps } from './components/billing/UpgradeModal.js';

// UI-03: Gate components
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

// UI-04: Usage display components
export { UsageMeter, getUsageMeterColor } from './components/usage/UsageMeter.js';
export type { UsageMeterProps } from './components/usage/UsageMeter.js';

export { UsageDashboard } from './components/usage/UsageDashboard.js';
export type {
  UsageDashboardProps,
  UsageDashboardFeature,
} from './components/usage/UsageDashboard.js';

export { UsageAlert } from './components/usage/UsageAlert.js';
export type { UsageAlertProps, UsageAlertFeature } from './components/usage/UsageAlert.js';

// UI-05: Billing portal components
export { CreditBalance } from './components/billing/CreditBalance.js';
export type { CreditBalanceProps } from './components/billing/CreditBalance.js';

export { CreditHistory } from './components/billing/CreditHistory.js';
export type { CreditHistoryProps, CreditTransaction } from './components/billing/CreditHistory.js';

export { PlanBadge } from './components/billing/PlanBadge.js';
export type { PlanBadgeProps } from './components/billing/PlanBadge.js';

export { BillingPortal } from './components/billing/BillingPortal.js';
export type { BillingPortalProps } from './components/billing/BillingPortal.js';

export { CurrentPlan } from './components/billing/CurrentPlan.js';
export type { CurrentPlanProps, CurrentPlanData } from './components/billing/CurrentPlan.js';

export { InvoiceList } from './components/billing/InvoiceList.js';
export type { InvoiceListProps, Invoice } from './components/billing/InvoiceList.js';

export { PaymentMethodDisplay } from './components/billing/PaymentMethodDisplay.js';
export type {
  PaymentMethodDisplayProps,
  PaymentMethod,
} from './components/billing/PaymentMethodDisplay.js';

export {
  CancelSubscriptionButton,
  CANCEL_REASONS,
} from './components/billing/CancelSubscriptionButton.js';
export type { CancelSubscriptionButtonProps } from './components/billing/CancelSubscriptionButton.js';
