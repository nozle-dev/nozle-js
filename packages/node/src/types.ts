import type { RefusalReason } from "./errors";

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

/** One event of {@link Nozle.trackBatch}: the arguments of `track()` as an object. */
export interface TrackBatchEvent {
  customerId: string;
  event: string;
  metadata?: Record<string, unknown>;
  subscriptionId?: string;
  /** Generated (UUID v7) when missing, and returned in the result. Must be unique within the call. */
  transactionId?: string;
  /** RFC 3339 or Unix seconds, as for `track()`. Each event keeps its own; none is shifted or clamped. */
  timestamp?: string;
}

export interface TrackBatchOptions {
  /** Events per request, 1 to 5000 (the Engine 2.28.0+ maximum; default 5000). A lower Engine cap is handled by splitting. */
  chunkSize?: number;
  /** Requests in flight at once, 1 to 64 (default 4). */
  concurrency?: number;
}

/** The outcome of one event of {@link Nozle.trackBatch}, at the same position as in the input. */
export type TrackBatchEventResult =
  | { index: number; transactionId: string; status: "accepted" }
  /** Engine refused this event; `errors` maps a field to codes, for example `{ code: ["value_is_mandatory"] }`. Do not resend it unchanged. */
  | { index: number; transactionId: string; status: "rejected"; errors: Record<string, string[]> }
  /** The request carrying it failed (`NozleApiError`, network error or timeout) and it may or may not be stored. Resend it with the same `transactionId`. */
  | { index: number; transactionId: string; status: "failed"; error: unknown };

export interface TrackBatchResult {
  total: number;
  accepted: number;
  rejected: number;
  failed: number;
  /** One entry per input event, in input order. */
  results: TrackBatchEventResult[];
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
  /**
   * Denial code when `allowed` is `false`, one of {@link RefusalReason}: `feature_not_found`, `no_subscription`,
   * `subscription_required`, `no_entitlement`, `usage_limit_exceeded`, `economic_policy_denied`,
   * `customer_payment_overdue` (the customer's unpaid invoices are past the plan's grace; `used` is `0` and
   * `limit`/`remaining` are `null`) or `budget_exceeded` (a hard spend limit is used up; see `budget`).
   */
  reason?: RefusalReason | (string & {});
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
  /** The spend limit that refused the call (`budget_exceeded`), else the tightest one covering the Feature (Engine 2.34.0+). */
  budget?: Budget;
}

/**
 * One money budget (spend limit) and its standing in the current period. Amounts are decimal strings in major units
 * of `currency`.
 */
export interface Budget {
  /** The Feature the limit covers; `null` for the subscription's total limit. */
  feature_code: string | null;
  limit: string;
  /** Gross metered usage charges booked this period. */
  spent: string;
  /** Spend reserved by open budget holds. */
  held: string;
  remaining: string;
  currency: string;
  period: "billing_period" | "calendar_month" | "lifetime";
  period_start: string;
  /** `null` for a `lifetime` limit. */
  period_end: string | null;
  /** A `soft` limit never refuses. */
  mode: "hard" | "soft";
  /** `warning` once a threshold is reached, `exceeded` once spent plus held reaches the limit. */
  status: "ok" | "warning" | "exceeded";
  /** Time of the latest event booked into `spent` (usage reaches the Engine a few seconds late); `null` before any. */
  as_of: string | null;
  /** When counting began: `period_start` once earlier spend in the period is counted, else when the count started; `null` before any. Engine 2.38.0. */
  counted_from?: string | null;
}

export interface BudgetListOptions {
  /** External id of the subscription, for a customer with several. */
  subscriptionId?: string;
}

/** `GET /customers/{id}/budgets`: every spend limit of the subscription. */
export interface BudgetList {
  customer_id: string;
  subscription_id: string;
  budgets: Budget[];
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
  /** What the policy does for a feature with no Cost Rule. Engine 2.39.0; absent on older Engines. */
  on_not_configured?: "allow" | "warn" | "deny";
  /** Target of the policy that decided the call. Engine 2.40.0; absent on older Engines. */
  scope?: "customer" | "plan" | "feature" | "organization";
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
  /** The plan family this plan is a variant of. Absent for a plan without a family. */
  family?: PlanFamilyRef;
  /** Every current variant of the family: one price per interval and currency. Absent for a plan without a family. */
  prices?: PlanPrice[];
}

/** A plan's family as the catalog returns it: the currencies it is sold in, in order, and the default one. */
export interface PlanFamilyRef {
  code: string;
  currencies: string[];
  default_currency: string;
}

/** One variant of a plan family: the plan sold for an interval in a currency. */
export interface PlanPrice {
  currency: string;
  interval: string;
  plan_code: string;
  amount_cents: number;
}

export interface PlansOptions {
  /** A secret key gets every plan; `false` gets the pricing table view a publishable key gets. */
  includeHidden?: boolean;
  /** Lists only plans in this ISO currency. An unknown currency is a 422. */
  currency?: string;
  /**
   * Secret key only: lists only plans in this customer's locked currency when `currency` is not given. Ignored when
   * the organization allows several currencies per customer.
   */
  externalCustomerId?: string;
}

/**
 * Sells a plan family's variant instead of a plan code: Core picks the family's current plan for the interval and
 * currency. Without `currency` it uses the customer's locked currency, else the family's default.
 */
export interface PlanFamilySelection {
  planFamilyCode: string;
  interval: string;
  currency?: string;
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

/**
 * A hosted payment page: the Stripe Checkout page or a Razorpay payment link. Redirect the customer to `url`
 * (`payment_url` is the same address). For a paid upgrade poll `checkoutStatus(plan_upgrade_intent_id, scope)` after they return.
 * A new subscription or invoice checkout has no status call: confirm through webhooks or by reloading billing state.
 * A Stripe `checkout_id` is the Stripe session id, not a status id.
 */
export interface HostedCheckoutResult {
  type: "hosted";
  url: string;
  payment_url: string;
  checkout_id?: string;
  amount_cents?: number;
  currency?: string;
  expires_at?: string;
  invoice_id?: string;
  plan_upgrade_intent_id?: string;
  external_entity_id?: string;
  external_subscription_id?: string;
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
  /** Where the hosted page sends a customer who leaves it. Validated like `returnUrl`; defaults to the return URL. A return URL may contain `{CHECKOUT_SESSION_ID}`. */
  cancelUrl?: string;
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
  | CompletedCheckoutResult
  | ScheduledCheckoutResult;

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
  type: "hosted" | "razorpay" | "processing" | "completed";
  checkout_id?: string;
  key_id?: string;
  order_id?: string;
  status: string;
  /** Hosted result: redirect the customer here. */
  url?: string;
  payment_url?: string;
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

/** What `updateSubscription` does to a trial: exactly one of `extend_days`, `ends_at` or `convert`. */
export type SubscriptionTrialUpdate = { reason?: string } & (
  | { extend_days: number; ends_at?: never; convert?: never }
  | { ends_at: string; extend_days?: never; convert?: never }
  | { convert: true; extend_days?: never; ends_at?: never }
);

/** Result of `updateSubscription`: the subscription with its trial state. */
export interface UpdateSubscriptionResult {
  subscription: CoreSubscription & {
    /** When the trial ends (ISO 8601), or null when the subscription has no trial. */
    trial_ends_at: string | null;
    in_trial: boolean;
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
  /** Credits of this source reserved by open holds (Engine 2.34.0+). */
  held?: string;
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
  /** What can be spent now: open holds are already subtracted. */
  available: string;
  /** Credits reserved by open holds (Engine 2.34.0+). */
  held?: string;
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
  /** Credits reserved by open holds: the entity's own, the shared pool's, and the pool the entity spends from (Engine 2.34.0+). */
  entity_held?: string;
  shared_held?: string;
  held?: string;
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

/** A `budget_exceeded` refusal carries only `allowed`, `reason` and `budget`. */
export interface UsageCheckResult {
  advisory: true;
  allowed: boolean;
  metric_amount: string;
  credit_system: string;
  credits_required: string;
  available: string;
  projected_remaining?: string;
  projected_deductions?: UsageDeduction[];
  reason?: RefusalReason | (string & {});
  /** The used-up hard spend limit, with `reason` `budget_exceeded` (Engine 2.34.0+). */
  budget?: Budget;
}

/** A `budget_exceeded` refusal carries only `allowed`, `reason` and `budget`. */
export interface UsageTrackResult {
  allowed: boolean;
  operation_id?: string;
  metric_amount?: string;
  credit_system?: string;
  credits_required?: string;
  credits_consumed?: string;
  available?: string;
  remaining?: string;
  reason?: RefusalReason | (string & {});
  deductions?: UsageDeduction[];
  /** The used-up hard spend limit, with `reason` `budget_exceeded` (Engine 2.34.0+). */
  budget?: Budget;
}

export type UsageHoldStatus = "held" | "denied" | "finalized" | "released" | "expired";

/** The `usage.track` request plus how long the hold lasts. */
export interface UsageHoldCreateParams extends UsageTrackParams {
  /** Seconds until the hold expires: 1 to 86400, Engine default 900. */
  ttlSeconds?: number;
}

/** The actual usage of the held call. */
export interface UsageHoldFinalizeParams {
  properties?: Record<string, unknown>;
  timestamp?: string;
}

export interface UsageHoldListOptions {
  status?: UsageHoldStatus;
}

/** A hold on credits: the Feature is billed in credits. */
export interface CreditUsageHold {
  /** Engine sends no `kind` for a credit hold. */
  kind?: undefined;
  hold_id: string;
  status: UsageHoldStatus;
  customer_id: string;
  entity_id?: string;
  subscription_id?: string;
  feature_code: string;
  credit_system: string;
  pool_policy?: string;
  metric_amount: string;
  credits_required: string;
  /** "0" for a denied hold. */
  credits_held: string;
  expires_at: string;
  created_at: string;
  resolved_at: string | null;
  operation_id?: string;
}

/**
 * A budget hold (Engine 2.34.0+): the Feature is billed in money under a hard spend limit, so the hold reserves the
 * call's estimated spend. Finalize sends the usage as one event; its spend is then booked.
 */
export interface BudgetUsageHold {
  kind: "budget";
  hold_id: string;
  status: UsageHoldStatus;
  customer_id: string;
  subscription_id: string;
  feature_code: string;
  metric_amount: string;
  /** Spend reserved, a decimal string in major units of `currency`; "0" once released, expired or denied. */
  amount_held: string;
  currency: string;
  expires_at: string;
  created_at: string;
  resolved_at: string | null;
}

/** A credit hold, or a budget hold when `kind` is `"budget"`. */
export type UsageHold = CreditUsageHold | BudgetUsageHold;

export interface CreditUsageHoldCreateResult extends CreditUsageHold {
  allowed: boolean;
  reason?: RefusalReason | (string & {});
  available: string;
}

export interface BudgetUsageHoldCreateResult extends BudgetUsageHold {
  allowed: boolean;
  /** `budget_exceeded` when the estimated spend does not fit. */
  reason?: RefusalReason | (string & {});
  budget?: Budget;
}

export type UsageHoldCreateResult = CreditUsageHoldCreateResult | BudgetUsageHoldCreateResult;

export interface CreditUsageHoldFinalizeResult extends UsageTrackResult {
  kind?: undefined;
  entity_id?: string;
  pool_policy?: string;
  hold_id: string;
  hold_status: UsageHoldStatus;
  credits_held: string;
  credits_released: string;
  /** The hold had expired, so the usage ran as a plain track. */
  hold_expired: boolean;
}

/** A credit hold's finalize answers the track result; a budget hold's answers the hold itself (`kind` `"budget"`). */
export type UsageHoldFinalizeResult = CreditUsageHoldFinalizeResult | BudgetUsageHold;

export interface UsageHoldList {
  customer_id: string;
  holds: UsageHold[];
}

/** One subscription as Core returns it (`GET /subscriptions`). */
export type CoreSubscription = import("./generated/openapi").components["schemas"]["SubscriptionObject"];

/** A customer's usage for one billing period (Core `current_usage`, or one `past_usage` period). */
export type CustomerUsage = import("./generated/openapi").components["schemas"]["CustomerUsageObject"];

type Schemas = import("./generated/openapi").components["schemas"];

/** Margin forecast for the 30 days after the range (`GET /margin/forecast`). */
/** `GET /margin/summary`. Amounts are integer cents. */
export type MarginSummary = Schemas["MarginSummary"];
/** `GET /margin/customers`; `customers` is null when there are none. */
export type MarginByCustomer = Schemas["MarginByCustomerResponse"];
/** `GET /margin/metrics`; `metrics` is null when there are none. */
export type MarginByMetric = Schemas["MarginByMetricResponse"];
/** `GET /margin/plans`; `plans` is null when there are none. */
export type MarginByPlan = Schemas["MarginByPlanResponse"];
/** `GET /margin/models`; `models` is null when there are none. */
export type MarginByModel = Schemas["MarginByModelResponse"];
/** `GET /margin/trend`; `trend` is null when the range has no events. */
export type MarginTrend = Schemas["MarginTrendResponse"];

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
