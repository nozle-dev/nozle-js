export { BillingPortal } from "./components/portal/BillingPortal.js";
export { CancellationControl } from "./components/portal/CancellationControl.js";
export { PlanChangeControl } from "./components/portal/PlanChangeControl.js";
export type {
  PortalPlan,
  PlanChangeState,
  PlanChangePreview,
  PlanChangeOperation,
  PlanChangeActions,
  PlanChangeControlProps,
  PlanChangeInput,
  PlanChangePreviewInput,
  PlanChangeApplyInput,
  PlanChangeWithdrawInput,
} from "./components/portal/PlanChangeControl.js";
export type {
  CancellationActions,
  CancellationApplyInput,
  CancellationInput,
  CancellationOperation,
  CancellationPreview,
  CancellationSubscription,
  CancellationControlProps,
} from "./components/portal/CancellationControl.js";
export type { BillingPortalProps } from "./components/portal/BillingPortal.js";
export { BillingPortalError } from "./components/portal/client.js";
export type {
  BillingPortalSession,
  CreateBillingPortalSession,
} from "./components/portal/client.js";

/** @nozle-js/react — public catalog and merchant-BFF checkout components. */

export { useAppearance } from "./appearance/context.js";
export type { UseAppearance, ElementProps } from "./appearance/context.js";
export type { Appearance, Elements, ElementKey, Theme, Variables } from "./appearance/tokens.js";

export {
  BillingProvider,
  BillingContext,
  useBillingContext,
  useOptionalBillingContext,
  useNozleClient,
  BillingRequestError,
} from "./provider.js";
export type {
  BillingFetch,
  BillingContextValue,
  BillingProviderProps,
  CheckoutResult,
  CompletedCheckoutResult,
  CheckoutSubscriptionResult,
  CreateCheckout,
  CreateCheckoutInput,
  NozleClient,
  ScheduledCheckoutResult,
} from "./provider.js";

export { usePlans } from "./hooks/use-plans.js";
export {
  useSubscription,
  useEntitlement,
  useCreditBalance,
  useCreditHistory,
  useUsage,
  useUpgradePreview,
  useBillingRefresh,
} from "./hooks/use-billing.js";
export type { BillingSubscription, EntitlementResult, UpgradePreview } from "./hooks/use-billing.js";
export type { Plan as CatalogPlan } from "./hooks/use-plans.js";

export { useCheckout as useCheckoutSession } from "./hooks/use-checkout.js";
export type { UseCheckoutResult as UseCheckoutSessionResult } from "./hooks/use-checkout.js";

export { PricingTable } from "./components/pricing/PricingTable.js";
export type {
  PricingTableProps,
  PricingPlan,
} from "./components/pricing/PricingTable.js";

export { planFeatures } from "./components/pricing/plan-features.js";
export type {
  CatalogCharge,
  CatalogCreditGrantRule,
  CatalogEntitlement,
  CatalogPrivilege,
} from "./components/pricing/plan-features.js";

export { PlanCard } from "./components/pricing/PlanCard.js";
export type { PlanCardProps } from "./components/pricing/PlanCard.js";

export { PlanComparison } from "./components/pricing/PlanComparison.js";
export type {
  ComparisonFeature,
  PlanComparisonProps,
} from "./components/pricing/PlanComparison.js";
export { comparisonRows, sortPlansByPrice } from "./components/pricing/plan-features.js";
export type { ComparisonRow } from "./components/pricing/plan-features.js";

export { CheckoutButton } from "./components/billing/CheckoutButton.js";
export type { CheckoutButtonProps } from "./components/billing/CheckoutButton.js";

export { Checkout, useCheckout } from "./components/billing/Checkout.js";
export type {
  CheckoutProps,
  UseCheckoutResult,
} from "./components/billing/Checkout.js";

export { UpgradeButton } from "./components/billing/UpgradeButton.js";
export type { UpgradeButtonProps } from "./components/billing/UpgradeButton.js";

export { UpgradeModal } from "./components/billing/UpgradeModal.js";
export type {
  ProrationPreview,
  UpgradeModalProps,
} from "./components/billing/UpgradeModal.js";

export { FeatureGate } from "./components/gates/FeatureGate.js";
export type { FeatureGateProps } from "./components/gates/FeatureGate.js";

export { UsageGate } from "./components/gates/UsageGate.js";
export type { UsageGateProps } from "./components/gates/UsageGate.js";

export { PlanGate } from "./components/gates/PlanGate.js";
export type { PlanGateProps } from "./components/gates/PlanGate.js";

export { UpgradePrompt } from "./components/gates/UpgradePrompt.js";
export type { UpgradePromptProps } from "./components/gates/UpgradePrompt.js";

export { LockedOverlay } from "./components/gates/LockedOverlay.js";
export type { LockedOverlayProps } from "./components/gates/LockedOverlay.js";

export {
  UsageMeter,
  getUsageMeterColor,
} from "./components/usage/UsageMeter.js";
export type { UsageMeterProps } from "./components/usage/UsageMeter.js";

export { UsageDashboard, usageItems } from "./components/usage/UsageDashboard.js";
export type {
  UsageDashboardProps,
  UsageDashboardFeature,
  UsageResult,
} from "./components/usage/UsageDashboard.js";

export { UsageAlert } from "./components/usage/UsageAlert.js";
export type {
  UsageAlertProps,
  UsageAlertFeature,
} from "./components/usage/UsageAlert.js";

export { PlanBadge } from "./components/billing/PlanBadge.js";
export type { PlanBadgeProps } from "./components/billing/PlanBadge.js";

export { PaymentMethodDisplay } from "./components/billing/PaymentMethodDisplay.js";
export type {
  PaymentMethodDisplayProps,
  PaymentMethod,
} from "./components/billing/PaymentMethodDisplay.js";

export type {
  RazorpayCheckoutResult,
  ProcessingCheckoutResult,
  HostedCheckoutResult,
  RazorpayVerification,
  CheckoutStatus,
  VerifyCheckout,
  GetCheckoutStatus,
} from "./provider.js";

export { CreditBalance } from "./components/credits/CreditBalance.js";
export type {
  CreditBalanceData,
  CreditBalanceProps,
  CreditBalanceSource,
} from "./components/credits/CreditBalance.js";

export { CreditHistory } from "./components/credits/CreditHistory.js";
export type {
  CreditHistoryProps,
  CreditOperationData,
} from "./components/credits/CreditHistory.js";

export { UsageBreakdown } from "./components/usage/UsageBreakdown.js";
export type { UsageBreakdownProps } from "./components/usage/UsageBreakdown.js";

export { UsageTrend } from "./components/usage/UsageTrend.js";
export type { UsageTrendProps } from "./components/usage/UsageTrend.js";
export type { ChargeUsageData, CustomerUsageData } from "./components/usage/usage-data.js";
