export interface NozleConfig {
  apiKey: string;
  baseUrl?: string;
  eventsUrl?: string;
  timeout?: number;
}

export interface TrackOptions {
  subscriptionId?: string;
  transactionId?: string;
  timestamp?: string;
}

export interface CanResult {
  allowed: boolean;
  reason?: string;
  used: number;
  limit?: number;
  remaining?: number;
  overage?: boolean;
  cost_per_use_cents: number;
  revenue_per_use_cents: number;
  margin_per_use_cents: number;
  margin_percent?: number;
  min_margin_percent?: number;
  margin_level?: string;
  margin_enforcement_mode?: string;
  warning?: string;
}

export interface Plan {
  code: string;
  name: string;
  amount_cents: number;
  amount_currency: string;
  interval: string;
}

export type CheckoutResult =
  | {
      type: "stripe";
      client_secret?: string;
      clientSecret?: string;
      url?: string;
      invoice_id?: string;
      amount_cents?: number;
      currency?: string;
    }
  | {
      type: "completed" | "scheduled";
      status: string;
      subscription_id?: string;
      plan_code?: string;
    };

export interface SubscribeResult {
  subscription_id: string;
  status: string;
}

export type CancellationPolicy = "end_of_period" | "immediate";

export interface CancelSubscriptionResult {
  subscription: {
    external_id: string;
    status: string;
    ending_at: string | null;
    terminated_at?: string | null;
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
  version?: string;
}

export interface CustomerUpsertParams {
  externalId: string;
  name?: string;
  email?: string;
}

export interface CustomerUpsertResult {
  external_id: string;
  name?: string;
  email?: string;
}

export interface CheckAndDeductParams {
  customerId: string;
  feature: string;
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
  billable_metric_code: string | null;
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
  billableMetricCode: string;
  creditSystemCode?: string;
  properties?: Record<string, unknown>;
  occurredAt?: string;
}

export interface UsageTrackParams {
  customerId: string;
  entityId?: string;
  billableMetricCode: string;
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
