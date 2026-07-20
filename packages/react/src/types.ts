export interface EntitlementsResponse {
  plan_slug: string;
  subscription_status: string;
  features: Record<string, { enabled: boolean }>;
  limits: Record<string, { limit: number; used: number; source?: string }>;
}

export interface BillingState {
  entitlements: EntitlementsResponse | null;
  credits: null;
  usage: Record<string, { used: number; limit: number; remaining: number }>;
  connectionState: "connecting" | "connected" | "disconnected";
  error: Error | null;
}

export interface UseCanResult {
  allowed: boolean;
  isLoading: boolean;
  error: Error | null;
}

export interface UseUsageResult {
  data: { used: number; limit: number; remaining: number } | null;
  isLoading: boolean;
  error: Error | null;
}

export interface UsePlanResult {
  data: { plan_slug: string; subscription_status: string } | null;
  isLoading: boolean;
  error: Error | null;
}

export interface CheckoutResult {
  client_secret: string;
  invoice_id: string;
  amount_cents: number;
  currency: string;
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

export interface CreditBalanceData {
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

export interface CreditBalancesResponse {
  customer_id: string;
  as_of: string;
  balances: CreditBalanceData[];
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

export interface CreditOperationsResponse {
  customer_id: string;
  operations: CreditOperation[];
  next_cursor: string | null;
}
