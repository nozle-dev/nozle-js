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
