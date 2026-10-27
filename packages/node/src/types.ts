export interface NozleConfig {
  /** Organization credential. Defaults to the NOZLE_SECRET_KEY environment variable. */
  apiKey?: string;
  /** Root URL of the Nozle API. Engine calls go to `${host}/engine` and Core calls to `${host}/core`. Defaults to https://api.nozle.app. */
  host?: string;
  /** Engine URL. Overrides the engine address derived from `host`. */
  baseUrl?: string;
  /** Core billing resources and subscription discovery. Overrides the Core address derived from `host`. */
  eventsUrl?: string;
  /** Per-attempt timeout in milliseconds. Default 10000. */
  timeout?: number;
  /** Extra attempts after a network error, timeout, 429 or 5xx. Default 0: no retries. Only requests that are safe to repeat are retried: reads, calls with an idempotency key, and event, cost event and customer writes. */
  maxRetries?: number;
  /** First retry delay in milliseconds, doubled each retry up to 10 seconds, or the `Retry-After` header when sent. Default 500. */
  retryDelayMs?: number;
}

export interface TrackOptions {
  subscriptionId?: string;
  transactionId?: string;
  timestamp?: string;
}

export interface CostEventParams {
  costMeterCode: string;
  costEventId?: string;
  parentTransactionId?: string;
  externalCustomerId?: string;
  requestId?: string;
  operationKey?: string;
  properties?: Record<string, unknown>;
  timestamp?: number;
}

export interface CostEventAccepted {
  status: "accepted";
  cost_event_id: string;
}

/**
 * Which subscription `can()` evaluates, for a customer with several. Without either, the customer's one
 * subscription is used; with several, the result is `allowed: false, reason: "subscription_required"`.
 */
export interface CanOptions {
  /** External id of the subscription. */
  subscriptionId?: string;
  /** External id of the Entity whose subscription is evaluated. */
  entityId?: string;
}

export interface CanResult {
  allowed: boolean;
  reason?: string;
  feature_type?: string;
  configuration?: Record<string, string>;
  used: number;
  /** `null` when the feature has no limit. */
  limit: number | null;
  /** `null` when the feature has no limit. */
  remaining: number | null;
  overage?: boolean;
  economics?: CanEconomics;
  policy?: CanPolicy;
}

export interface CanEconomics {
  status: "estimated" | "not_configured" | "unavailable" | "stale";
  currency?: string;
  estimated_incremental_cost?: string;
  estimated_incremental_revenue?: string;
  estimated_incremental_margin?: string;
  estimated_margin_percent?: string;
  rule_version_ids?: string[];
  includes?: string[];
  excludes?: string[];
  reason?: string;
  calculated_at: string;
}

export interface CanPolicy {
  version_id: string;
  mode: "allow" | "warn" | "deny";
  on_unavailable: "allow" | "warn" | "deny";
  minimum_margin_amount?: string;
  minimum_margin_percent?: string;
  maximum_estimated_cost?: string;
  maximum_snapshot_age_seconds: number;
  decision: "allow" | "warn" | "deny";
  reason: string;
}

export interface Plan {
  code: string;
  name: string;
  amount_cents: number;
  amount_currency: string;
  interval: string;
  /** The version of the code this plan is (plan versioning). `plans()` returns current versions only. */
  version?: number;
  /** Whether new subscriptions get this version. */
  is_current?: boolean;
}

export interface RazorpayCheckoutResult {
  type: "razorpay";
  checkout_id: string;
  key_id: string;
  order_id: string;
  amount_cents: number;
  currency: string;
  expires_at?: string;
  /** Set for an invoice checkout. A paid upgrade returns `plan_upgrade_intent_id` instead. */
  invoice_id?: string;
  plan_upgrade_intent_id?: string;
  external_entity_id?: string;
  external_subscription_id?: string;
  /** Mandate checkout only: the Razorpay customer to pass to the modal with `recurring: "1"`. */
  customer_id?: string;
  recurring?: boolean;
  mandate_max_amount_cents?: number;
}

/**
 * The checkout is not ready to collect payment yet: Razorpay while the order is
 * being created, and Stripe when a quoted upgrade is replayed while its webhook is
 * still pending. Recover with the checkout status call using `checkout_id`.
 */
export interface ProcessingCheckoutResult {
  type: "processing";
  checkout_id: string;
  status: string;
  amount_cents?: number;
  currency?: string;
  expires_at?: string;
  invoice_id?: string;
  plan_upgrade_intent_id?: string;
}

/** A Razorpay payment link. Redirect the customer to `payment_url`. */
export interface HostedCheckoutResult {
  type: "hosted";
  payment_url: string;
  checkout_id?: string;
  amount_cents?: number;
  currency?: string;
  expires_at?: string;
  invoice_id?: string;
  plan_upgrade_intent_id?: string;
}

/**
 * Stripe only: redirect the customer to `url`. A Razorpay customer pays each invoice by payment link,
 * so the call throws `NozleApiError` (status 422) where `hasCode("razorpay_pays_by_link")` is true.
 */
export interface ManagePaymentMethodResult {
  url: string;
  expires_at: string | null;
  provider: "stripe";
}

export interface CheckoutOptions {
  idempotencyKey?: string;
  registerMandate?: boolean;
  externalEntityId?: string;
  /** External subscription identifier for a customer plan change. */
  subscriptionId?: string;
  /** Opaque quote from previewSubscriptionChange; never reformat or inspect it. */
  quoteId?: string;
}

export interface SubscriptionCheckoutScope {
  customerId: string;
  subscriptionId: string;
}

export interface SubscriptionPlan {
  code: string;
  name: string;
  amount_cents: number | string;
  currency: string;
  interval: string;
}

export interface SubscriptionOptions {
  subscription: {
    id: string;
    external_id: string;
    plan_code: string;
    status: string;
    ending_at: string | null;
    plan: SubscriptionPlan;
    /** The version of the plan code the subscription is billed on. Set by the billing handler from Core. */
    plan_version?: number | null;
    /** That version's entitlements (with its usage limits). Set by the billing handler; null when unavailable. */
    entitlements?: unknown[] | null;
  };
  pending_change: {
    id: string;
    plan_code: string;
    name: string;
    effective_at: string;
    plan: SubscriptionPlan;
  } | null;
  eligible_plans: Array<SubscriptionPlan & {
    direction: "upgrade" | "downgrade";
    timing: "immediate" | "end_of_period";
  }>;
  checkout?: { id: string; status: string; plan_code: string } | null;
}

export interface SubscriptionChangePreview {
  quote_id: string;
  currency: string;
  credit_amount_cents: number | string;
  debit_amount_cents: number | string;
  net_amount_cents: number | string;
  amount_due_now_cents: number | string;
  amount_due_at_effective_cents: number | string;
  transition_direction: "upgrade" | "downgrade";
  timing: "immediate" | "end_of_period";
  effective_at: string;
  renewal_at: string | null;
}

export interface WithdrawPendingSubscriptionChangeResult {
  subscription: Pick<SubscriptionOptions["subscription"], "id" | "external_id" | "plan_code" | "status">;
  withdrawn_pending_subscription_id: string;
  replayed: boolean;
}

export interface RazorpayVerification {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface CheckoutStatus {
  checkout_id: string;
  provider: "razorpay" | "stripe";
  status:
    | "processing"
    | "awaiting_payment"
    | "succeeded"
    | "failed"
    | "expired"
    | "needs_review";
  fulfillment_status: "pending" | "processing" | "succeeded";
  amount_cents: number;
  currency: string;
  invoice_id?: string | null;
  checkout?: CheckoutResult;
}

export type CheckoutResult =
  | RazorpayCheckoutResult
  | ProcessingCheckoutResult
  | HostedCheckoutResult
  | StripeCheckoutResult
  | CompletedCheckoutResult
  | ScheduledCheckoutResult;

/** Stripe embedded checkout: mount `client_secret` with your own Stripe publishable key. */
export interface StripeCheckoutResult {
  type: "stripe";
  /** Embedded Checkout Session secret (`cs_...`). Same value as `clientSecret`. */
  client_secret?: string;
  clientSecret?: string;
  invoice_id?: string;
  /** Set instead of `invoice_id` for a paid upgrade; poll it with `checkoutStatus`. */
  plan_upgrade_intent_id?: string;
  amount_cents?: number;
  currency?: string;
  external_entity_id?: string;
  external_subscription_id?: string;
  checkout_id?: string;
}

/** The change is done: paid with credits, or nothing was due. */
export interface CompletedCheckoutResult {
  type: "completed";
  status: string;
  /** `credits` or `none`. */
  payment_source?: string;
  subscription_id?: string;
  plan_code?: string;
  invoice_id?: string;
  amount_cents?: number;
  currency?: string;
  external_entity_id?: string;
  external_subscription_id?: string;
  checkout_id?: string;
  /** An immediate configured downgrade carries the settlement fields of a transition result. */
  transition_direction?: string;
  transition_policy?: string;
  effective_at?: string;
  renewal_at?: string | null;
  amount_due_cents?: number | string;
}

/** The change takes effect later; `subscription_id` is the pending subscription. */
export interface ScheduledCheckoutResult {
  type: "scheduled";
  status: string;
  subscription_id?: string;
  plan_code?: string;
  /** `upgrade` or `downgrade`. */
  transition_direction?: string;
  transition_policy?: string;
  effective_at?: string;
  external_entity_id?: string;
  external_subscription_id?: string;
  checkout_id?: string;
}

export interface EntitySubscriptionPlan {
  code: string;
  name: string;
  interval: string;
  amount_cents: number;
  amount_currency: string;
  status: string;
  effective_at: string | null;
}

export interface EntitySubscription {
  external_customer_id: string;
  external_entity_id: string;
  external_subscription_id: string;
  status: string;
  current_plan: EntitySubscriptionPlan | null;
  pending_plan: EntitySubscriptionPlan | null;
  billing_time: "calendar" | "anniversary" | null;
  subscription_at: string | null;
  started_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  ending_at: string | null;
  canceled_at: string | null;
  cancel_at_period_end: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface EntitySubscriptionList {
  entity_subscriptions: EntitySubscription[];
}

export interface EntitySubscriptionCheckoutParams {
  registerMandate?: boolean;
  planCode: string;
  returnUrl?: string;
  billingTime?: "calendar" | "anniversary";
  idempotencyKey?: string;
}

export interface EntitySubscriptionCheckoutItem {
  externalEntityId: string;
  planCode: string;
}

export interface EntitySubscriptionCheckoutManyParams {
  items: EntitySubscriptionCheckoutItem[];
  returnUrl?: string;
  billingTime?: "calendar" | "anniversary";
  idempotencyKey: string;
}

export interface EntitySubscriptionCheckoutItemResult {
  external_entity_id: string;
  external_subscription_id: string;
  plan_code: string;
  subscription_status: string;
}

export interface EntitySubscriptionCheckoutManyResult {
  id: string;
  type: "stripe" | "razorpay" | "processing" | "completed";
  checkout_id?: string;
  key_id?: string;
  order_id?: string;
  status: string;
  client_secret: string | null;
  clientSecret?: string | null;
  invoice_id: string;
  amount_cents: number;
  currency: string;
  replayed: boolean;
  expires_at: string | null;
  items: EntitySubscriptionCheckoutItemResult[];
}

export interface EntitySubscriptionCancelParams {
  idempotencyKey: string;
  timing?: SubscriptionTransitionTiming;
  creditAction?: SubscriptionTransitionCreditAction;
  refundMode?: SubscriptionTransitionRefundMode;
  finalInvoiceAction?: SubscriptionTransitionFinalInvoiceAction;
}

export interface EntitySubscriptionCancelResult {
  entity_subscription: EntitySubscription;
  subscription_transition: SubscriptionTransitionResult["subscription_transition"];
}

export interface SubscribeOptions {
  /**
   * The version of the plan code to sell instead of the current one. Another version of an existing subscription
   * fails with a 422 `plan_version_change_not_supported`; an unknown version with a 404 `plan_version_not_found`.
   */
  planVersion?: number;
}

export interface SubscribeResult {
  subscription_id: string;
  status: string;
}

export type CancellationPolicy = "end_of_period" | "immediate";

/** Options of `cancelSubscription`. Each one left out follows the subscription, then the organization's cancellation settings. */
export interface CancelSubscriptionOptions {
  /** When the subscription ends. Left out, the organization's cancellation timing applies. */
  policy?: CancellationPolicy;
  creditAction?: SubscriptionTransitionCreditAction;
  refundMode?: SubscriptionTransitionRefundMode;
  finalInvoiceAction?: SubscriptionTransitionFinalInvoiceAction;
}

export interface CancelSubscriptionResult {
  subscription: {
    external_id: string;
    status: string;
    ending_at: string | null;
    terminated_at?: string | null;
  };
}

export type SubscriptionTransitionOperation = "cancel" | "downgrade" | "uncancel";
export type SubscriptionTransitionTiming = "end_of_period" | "immediate";
export type SubscriptionTransitionBillingAnchor = "keep_anchor" | "reset_anchor";
export type SubscriptionTransitionProrationBehavior = "prorate_immediately" | "none";
export type SubscriptionTransitionCreditAction = "credit" | "refund" | "offset" | "none";
export type SubscriptionTransitionRefundMode = "prorated" | "full";
export type SubscriptionTransitionFinalInvoiceAction = "generate" | "skip";

export interface SubscriptionTransitionParams {
  customerId: string;
  subscriptionId: string;
  operation: SubscriptionTransitionOperation;
  timing?: SubscriptionTransitionTiming;
  targetPlanCode?: string;
  billingAnchor?: SubscriptionTransitionBillingAnchor;
  prorationBehavior?: SubscriptionTransitionProrationBehavior;
  creditAction?: SubscriptionTransitionCreditAction;
  refundMode?: SubscriptionTransitionRefundMode;
  finalInvoiceAction?: SubscriptionTransitionFinalInvoiceAction;
  /** For end-of-period cancellation, reject a changed confirmation date atomically. */
  expectedEffectiveAt?: string;
  /** Opaque plan-change quote; only valid for a downgrade transition. */
  quoteId?: string;
}

export interface SubscriptionTransitionPreview {
  subscription_transition: {
    operation: SubscriptionTransitionOperation;
    timing: SubscriptionTransitionTiming;
    billing_anchor: SubscriptionTransitionBillingAnchor;
    proration_behavior: SubscriptionTransitionProrationBehavior;
    credit_action: SubscriptionTransitionCreditAction;
    refund_mode: SubscriptionTransitionRefundMode;
    final_invoice_action: SubscriptionTransitionFinalInvoiceAction;
    effective_at: string;
    renewal_at?: string | null;
    credit_amount_cents: number;
    refund_amount_cents: number;
    offset_amount_cents: number;
    amount_due_cents: number;
    currency: string;
  };
}

export interface SubscriptionTransitionResult {
  subscription_transition: {
    id: string;
    replayed: boolean;
    operation: SubscriptionTransitionOperation;
    timing: SubscriptionTransitionTiming;
    billing_anchor: SubscriptionTransitionBillingAnchor;
    proration_behavior: SubscriptionTransitionProrationBehavior;
    credit_action: SubscriptionTransitionCreditAction;
    refund_mode: SubscriptionTransitionRefundMode;
    final_invoice_action: SubscriptionTransitionFinalInvoiceAction;
    effective_at: string;
    subscription_id?: string;
    external_subscription_id?: string;
    plan_code?: string;
    status?: string;
    credit_note_id?: string;
    credit_amount_cents: number;
    refund_amount_cents: number;
    offset_amount_cents: number;
    invoice_id?: string;
    amount_due_cents: number;
    currency?: string;
  };
}

export interface MarginQueryParams {
  from?: string;
  to?: string;
  [key: string]: string | undefined;
}

export interface TrendParams extends MarginQueryParams {
  granularity?: "hour" | "day" | "week" | "month";
}

export interface PingResult {
  ok: boolean;
  engine: string;
}

export interface CustomerBillingConfiguration {
  /** Payment provider type, e.g. `"stripe"`. */
  paymentProvider: string;
  /** Code of the payment provider connection in Nozle. */
  paymentProviderCode?: string;
  /** Existing customer ID at the provider, e.g. a Stripe `cus_…`. Links it without creating a new one. */
  providerCustomerId?: string;
  /** Create the customer at the provider when no `providerCustomerId` is given. */
  syncWithProvider?: boolean;
  providerPaymentMethods?: string[];
}

export interface CustomerUpsertParams {
  externalId: string;
  name?: string;
  email?: string;
  billingConfiguration?: CustomerBillingConfiguration;
}

export interface CustomerUpsertResult {
  external_id: string;
  name?: string;
  email?: string;
}

export interface CheckAndDeductParams {
  customerId: string;
  /** @deprecated Ignored: it is not sent, because the deduction depends only on the customer's wallet and `credits`. */
  feature?: string;
  credits: number;
}

export interface CheckAndDeductResult {
  allowed: boolean;
  remaining: number;
}

export interface CreditSystem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  unitName: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreditBalanceSource {
  id: string;
  entity_id?: string | null;
  parent_source_id?: string | null;
  scope?: "customer" | "entity";
  transferable?: boolean;
  returnable?: boolean;
  type:
    | "subscription_grant"
    | "top_up"
    | "manual_grant"
    | "adjustment"
    | "allocated_top_up";
  reference: string;
  subscription_id: string | null;
  initial: string;
  remaining: string;
  valid_from: string;
  expires_at: string | null;
  priority: number;
  status: string;
  available: boolean;
}

export interface CreditBalance {
  customer_id: string;
  credit_system: string;
  credit_system_id: string;
  credit_system_name: string;
  unit_name: string;
  system_status: string;
  available: string;
  as_of: string;
  sources: CreditBalanceSource[];
}

export interface CreditBalances {
  customer_id: string;
  as_of: string;
  balances: CreditBalance[];
}

export interface CreditOperationAllocation {
  source_id: string;
  source_entity_id?: string | null;
  source_type: string;
  delta: string;
  before: string;
  after: string;
}

export interface CreditOperation {
  id: string;
  entity_id?: string | null;
  credit_system: string;
  credit_system_id: string;
  credit_system_name: string;
  unit_name: string;
  feature_code: string | null;
  type:
    | "consume"
    | "grant"
    | "adjustment"
    | "expire"
    | "revoke"
    | "refund"
    | "transfer";
  status: "succeeded" | "denied" | "reversed";
  metric_amount: string | null;
  credit_amount: string;
  rate_id: string | null;
  rate_metric_amount: string | null;
  rate_credit_amount: string | null;
  reason: string | null;
  occurred_at: string;
  source_allocations: CreditOperationAllocation[];
}

export interface CreditOperationPage {
  customer_id: string;
  operations: CreditOperation[];
  next_cursor: string | null;
}

export interface CreditOperationQuery {
  creditSystemCode?: string;
  limit?: number;
  cursor?: string;
}

export type CustomerEntityStatus = "active" | "suspended" | "deleted";

export interface CustomerEntity {
  id: string;
  customer_id: string;
  external_id: string;
  name: string | null;
  status: CustomerEntityStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CustomerEntityUpsertData {
  name?: string | null;
  status: CustomerEntityStatus;
  metadata?: Record<string, unknown>;
}

export interface CustomerEntityBulkUpsertItem extends CustomerEntityUpsertData {
  externalId: string;
}

export interface IdempotentMutationOptions {
  idempotencyKey: string;
}

export interface CustomerEntityMutationResult {
  action:
    | "created"
    | "updated"
    | "unchanged"
    | "activated"
    | "reactivated"
    | "suspended"
    | "deleted";
  entity: CustomerEntity;
  replayed: boolean;
}

export interface CustomerEntityListQuery {
  status?: CustomerEntityStatus;
  limit?: number;
  cursor?: string;
}

export interface CustomerEntityPage {
  customer_id: string;
  entities: CustomerEntity[];
  next_cursor: string | null;
}

export interface CustomerEntityBulkMutationCounts {
  created: number;
  updated: number;
  unchanged: number;
  activated: number;
  reactivated: number;
  suspended: number;
  deleted: number;
}

export interface CustomerEntityBulkMutationResult {
  customer_id: string;
  entities: Array<Omit<CustomerEntityMutationResult, "replayed">>;
  counts: CustomerEntityBulkMutationCounts;
  replayed: boolean;
}

export type EntityCreditPoolPolicy =
  | "entity_only"
  | "entity_then_customer"
  | "customer_only";

export interface EntityCreditBalance
  extends Omit<CreditBalance, "available"> {
  entity_id: string;
  entity_status: CustomerEntityStatus;
  entity_available: string;
  shared_available: string;
  effective_available: string;
  consumed: string;
  pool_policy: EntityCreditPoolPolicy | null;
}

export interface EntityCreditBalances {
  customer_id: string;
  entity_id: string;
  entity_status: CustomerEntityStatus;
  as_of: string;
  balances: EntityCreditBalance[];
}

export interface EntityCreditOperationPage extends CreditOperationPage {
  entity_id: string;
}

export interface EntityCreditTransferParams {
  creditSystemCode: string;
  amount: string;
}

export interface EntityCreditTransferSource {
  source_id: string;
  parent_source_id?: string | null;
  source_type: "top_up" | "allocated_top_up";
  scope: "customer" | "entity";
  amount: string;
  before: string;
  after: string;
  expires_at: string | null;
  created?: boolean;
}

export interface EntityCreditTransferResult {
  transferred: boolean;
  operation_id: string;
  customer_id: string;
  entity_id: string;
  credit_system: string;
  direction: "allocation" | "deallocation";
  amount: string;
  available: string;
  reason?: string | null;
  parent_sources: EntityCreditTransferSource[];
  entity_sources: EntityCreditTransferSource[];
  replayed: boolean;
}

export interface UsageCheckParams {
  customerId: string;
  entityId?: string;
  featureCode: string;
  creditSystemCode?: string;
  properties?: Record<string, unknown>;
  occurredAt?: string;
}

export interface UsageTrackParams {
  customerId: string;
  entityId?: string;
  featureCode: string;
  creditSystemCode?: string;
  properties?: Record<string, unknown>;
  timestamp?: string;
}

export interface UsageTrackOptions {
  idempotencyKey: string;
}

export interface UsageDeduction {
  balance_source_id?: string;
  source_type: string;
  amount: string;
  remaining: string;
}

export interface UsageCheckResult {
  advisory: true;
  allowed: boolean;
  metric_amount: string;
  credit_system: string;
  credits_required: string;
  available: string;
  projected_remaining?: string;
  projected_deductions?: UsageDeduction[];
  reason?: string;
}

export interface UsageTrackResult {
  allowed: boolean;
  operation_id?: string;
  metric_amount?: string;
  credit_system?: string;
  credits_required?: string;
  credits_consumed?: string;
  available?: string;
  remaining?: string;
  reason?: string;
  deductions?: UsageDeduction[];
}

/** One subscription as Core returns it (`GET /subscriptions`). */
export type CoreSubscription = import("./generated/openapi").components["schemas"]["SubscriptionObject"];

/** A customer's usage for one billing period (Core `current_usage`, or one `past_usage` period). */
export type CustomerUsage = import("./generated/openapi").components["schemas"]["CustomerUsageObject"];

type Schemas = import("./generated/openapi").components["schemas"];

/** Margin forecast for the 30 days after the range (`GET /margin/forecast`). */
export type MarginForecast = Schemas["MarginForecastResponse"];

/** Result of replaying one metric's usage at a new unit price (`POST /margin/simulate`). All amounts are integer cents. */
export type MarginSimulation = Schemas["MarginSimulationResult"];

export interface MarginSimulateParams {
  metricCode: string;
  /** New unit price in dollars, 0 or more. */
  newPriceDollars: number;
}

export interface CostIntelligenceReportParams {
  /** Inclusive start (RFC 3339). Defaults to 30 days before the request. */
  from?: string;
  /** Exclusive end (RFC 3339). Defaults to the request time. */
  to?: string;
  /** Rows per breakdown and detail list, 1 to 500 (server default 100). */
  limit?: number;
}

/** Ledger-backed cost totals, breakdowns and review queues (`GET /cost-intelligence/report`). */
export type CostIntelligenceReport = Schemas["CostIntelligenceReport"];

export interface SharedCostAllocationParams {
  /** Start of the allocation period (RFC 3339). */
  allocationPeriodStart: string;
}

export type SharedCostAllocationPreview = Schemas["SharedCostAllocationPreview"];
export type SharedCostAllocationRun = Schemas["SharedCostAllocationRun"];

/** Opening balance of a subscription imported with `importBillingState` (Engine `credit-balance-imports`). */
export interface CreditBalanceImportParams {
  externalSubscriptionId: string;
  creditSystemCode: string;
  /** Decimal string, more than 0. */
  grantedAmount: string;
  /** Decimal string, from 0 to `grantedAmount`. */
  remainingAmount: string;
  externalEntityId?: string;
  /** Validate without writing. */
  dryRun?: boolean;
}

export type CreditBalanceImport = Schemas["CreditsBalanceImport"];

/** A subscription another system already bills (Core `billing-state-imports`). */
export interface BillingStateImportParams {
  subscription: {
    planCode: string;
    status: "active";
    billingAuthority: "external";
    externalReference: string;
    /** RFC 3339; the period must contain the current time and span exactly one plan interval. */
    currentPeriodStart: string;
    currentPeriodEnd: string;
  };
  externalEntityId?: string;
  /** Validate without writing. */
  dryRun?: boolean;
}

export type BillingStateImport = Schemas["BillingStateImport"];

export interface ImportOptions {
  /** Required, at most 255 bytes. Retry with the same key and an identical body. */
  idempotencyKey: string;
}
