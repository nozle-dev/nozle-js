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

export interface CheckoutResult {
  client_secret: string;
  invoice_id: string;
  amount_cents: number;
  currency: string;
}

export interface SubscribeResult {
  subscription_id: string;
  status: string;
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
  type: "subscription_grant" | "top_up" | "manual_grant" | "adjustment";
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
  source_type: string;
  delta: string;
  before: string;
  after: string;
}

export interface CreditOperation {
  id: string;
  credit_system: string;
  credit_system_id: string;
  credit_system_name: string;
  unit_name: string;
  billable_metric_code: string | null;
  type: "consume" | "grant" | "adjustment" | "expire" | "revoke" | "refund";
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

export interface CustomerSessionCreateParams {
  customerId: string;
  expiresInSeconds?: number;
}

export interface CustomerSession {
  token: string;
  customer_id: string;
  expires_at: string;
  scope: ["credits:read"];
}

export interface UsageCheckParams {
  customerId: string;
  billableMetricCode: string;
  creditSystemCode?: string;
  properties?: Record<string, unknown>;
  occurredAt?: string;
}

export interface UsageTrackParams {
  customerId: string;
  billableMetricCode: string;
  creditSystemCode?: string;
  properties?: Record<string, unknown>;
  timestamp?: string;
}

export interface UsageTrackOptions {
  idempotencyKey: string;
}

export interface UsageDeduction {
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
