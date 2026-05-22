import { can as _can } from "./can";
import { MarginClient } from "./margin";
import { track as _track } from "./track";
import type {
  NozleConfig,
  CanResult,
  TrackOptions,
  Plan,
  CheckoutResult,
  SubscribeResult,
} from "./types";

export class Nozle {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly eventsUrl: string;
  readonly margin: MarginClient;

  private readonly timeout: number;
  private subCache = new Map<string, string>();

  constructor(config: NozleConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? "http://localhost:8080").replace(/\/+$/, "");
    this.eventsUrl = (config.eventsUrl ?? "http://localhost:3000").replace(/\/+$/, "");
    this.timeout = config.timeout ?? 10_000;
    this.margin = new MarginClient(this.baseUrl, this.apiKey, this.timeout);
  }

  async track(
    customerId: string,
    event: string,
    metadata?: Record<string, unknown>,
    options?: TrackOptions,
  ): Promise<void> {
    const opts = { ...options };
    if (!opts.subscriptionId) {
      opts.subscriptionId = await this.resolveSubscription(customerId);
    }
    return _track(this.eventsUrl, this.apiKey, customerId, event, metadata, opts, this.timeout);
  }

  async can(customerId: string, feature: string): Promise<CanResult> {
    return _can(this.baseUrl, this.apiKey, customerId, feature, this.timeout);
  }

  async plans(): Promise<Plan[]> {
    const res = await fetch(`${this.baseUrl}/v1/plans`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!res.ok) throw new Error(`plans failed: ${res.status} ${res.statusText}`);
    const data = await res.json();
    return data.plans ?? [];
  }

  async checkout(customerId: string, planCode: string, successUrl?: string): Promise<CheckoutResult> {
    const res = await fetch(`${this.baseUrl}/v1/checkout`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        plan_code: planCode,
        customer_id: customerId,
        ...(successUrl && { success_url: successUrl }),
      }),
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!res.ok) throw new Error(`checkout failed: ${res.status} ${res.statusText}`);
    return res.json();
  }

  async subscribe(customerId: string, planCode: string): Promise<SubscribeResult> {
    const res = await fetch(`${this.baseUrl}/v1/subscribe`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        plan_code: planCode,
        customer_id: customerId,
      }),
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!res.ok) throw new Error(`subscribe failed: ${res.status} ${res.statusText}`);
    return res.json();
  }

  private async resolveSubscription(customerId: string): Promise<string> {
    const cached = this.subCache.get(customerId);
    if (cached) return cached;

    const res = await fetch(
      `${this.eventsUrl}/api/v1/subscriptions?external_customer_id=${encodeURIComponent(customerId)}&status[]=active`,
      {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(this.timeout),
      },
    );
    if (!res.ok) throw new Error(`subscription lookup failed: ${res.status}`);

    const data = await res.json();
    const subs = data.subscriptions ?? [];

    if (subs.length === 0) {
      throw new Error(`No active subscription for customer '${customerId}'`);
    }
    if (subs.length > 1) {
      throw new Error(
        `Customer '${customerId}' has ${subs.length} active subscriptions — pass subscriptionId explicitly`,
      );
    }

    const extId = subs[0].external_id;
    this.subCache.set(customerId, extId);
    return extId;
  }
}
