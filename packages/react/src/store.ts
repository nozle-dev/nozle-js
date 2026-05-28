import type { BillingState, CheckoutResult } from "./types";

export class BillingStore {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly customerId: string;

  private state: BillingState = {
    entitlements: null,
    credits: null,
    usage: {},
    connectionState: "connecting",
    error: null,
  };

  private listeners = new Set<() => void>();

  constructor(baseUrl: string, apiKey: string, customerId: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.customerId = customerId;
  }

  getSnapshot = (): BillingState => this.state;
  getServerSnapshot = (): BillingState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  setConnectionState(state: BillingState["connectionState"]): void {
    this.state = { ...this.state, connectionState: state };
    this.emit();
  }

  setError(error: Error | null): void {
    this.state = { ...this.state, error };
    this.emit();
  }

  updateUsage(metric: string, used: number, limit: number, remaining: number): void {
    this.state = {
      ...this.state,
      usage: {
        ...this.state.usage,
        [metric]: { used, limit, remaining },
      },
    };
    this.emit();
  }

  async fetchUsage(feature: string): Promise<void> {
    try {
      const res = await fetch(
        `${this.baseUrl}/v1/can?customer_id=${this.customerId}&feature=${feature}`,
        { headers: { Authorization: `Bearer ${this.apiKey}` } }
      );
      if (!res.ok) return;
      const data = await res.json();
      this.updateUsage(feature, data.used, data.limit, data.remaining);

      this.state = {
        ...this.state,
        entitlements: {
          plan_slug: "pro",
          subscription_status: "active",
          features: { [feature]: { enabled: data.allowed } },
          limits: { [feature]: { limit: data.limit, used: data.used, source: "entitlement" } },
        },
      };
      this.emit();
    } catch (err) {
      this.state = {
        ...this.state,
        error: err instanceof Error ? err : new Error(String(err)),
      };
      this.emit();
    }
  }

  async fetchCheckoutSecret(planCode: string, successUrl?: string): Promise<CheckoutResult> {
    const res = await fetch(`${this.baseUrl}/v1/checkout`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        plan_code: planCode,
        customer_id: this.customerId,
        success_url: successUrl || `${window.location.origin}/checkout/complete?session_id={CHECKOUT_SESSION_ID}`,
      }),
    });
    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      throw new Error(errorBody.error || "Failed to create checkout session");
    }
    return res.json();
  }

  async fetchPlans(): Promise<Array<{ code: string; name: string; amount_cents: number; amount_currency: string; interval: string }>> {
    const res = await fetch(`${this.baseUrl}/v1/plans`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.plans || [];
  }

  handleEvent(event: { type: string; [key: string]: unknown }): void {
    if (event.type === "usage.updated") {
      const metric = event.metric as string;
      const used = event.used as number;
      const limit = event.limit as number;
      const remaining = event.remaining as number;
      this.updateUsage(metric, used, limit, remaining);
    }
  }
}
