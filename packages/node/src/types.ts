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
  limit: number;
  remaining: number;
  cost_per_use_cents: number;
  revenue_per_use_cents: number;
  margin_per_use_cents: number;
  min_margin_percent?: number;
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
  session_id: string;
  plan_code: string;
  plan_name: string;
  amount_cents: number;
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
