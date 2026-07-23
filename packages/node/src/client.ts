import { can as _can } from "./can";
import { CreditsNamespace } from "./credits";
import { CreditSystemsNamespace } from "./credit-systems";
import { CustomerSessionsNamespace } from "./customer-sessions";
import { EntitiesNamespace } from "./entities";
import { MarginClient } from "./margin";
import { track as _track } from "./track";
import { UsageNamespace } from "./usage";
import type {
  NozleConfig,
  CanResult,
  TrackOptions,
  Plan,
  CheckoutResult,
  SubscribeResult,
  PingResult,
  CustomerUpsertParams,
  CustomerUpsertResult,
  CheckAndDeductParams,
  CheckAndDeductResult,
} from "./types";

export class Nozle {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly eventsUrl: string;
  readonly margin: MarginClient;
  readonly customers: CustomersNamespace;
  readonly customerSessions: CustomerSessionsNamespace;
  readonly creditSystems: CreditSystemsNamespace;
  readonly entities: EntitiesNamespace;
  readonly credits: CreditsNamespace;
  readonly usage: UsageNamespace;

  private readonly timeout: number;
  private subCache = new Map<string, string>();

  constructor(config: NozleConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? "http://localhost:8080").replace(
      /\/+$/,
      "",
    );
    this.eventsUrl = (config.eventsUrl ?? "http://localhost:3000").replace(
      /\/+$/,
      "",
    );
    this.timeout = config.timeout ?? 10_000;
    this.margin = new MarginClient(this.baseUrl, this.apiKey, this.timeout);
    this.customers = new CustomersNamespace(
      this.baseUrl,
      this.apiKey,
      this.timeout,
    );
    this.customerSessions = new CustomerSessionsNamespace(
      this.baseUrl,
      this.apiKey,
      this.timeout,
    );
    this.creditSystems = new CreditSystemsNamespace(
      this.eventsUrl,
      this.apiKey,
      this.timeout,
    );
    this.entities = new EntitiesNamespace(
      this.baseUrl,
      this.apiKey,
      this.timeout,
    );
    this.credits = new CreditsNamespace(
      this.baseUrl,
      this.apiKey,
      this.timeout,
    );
    this.usage = new UsageNamespace(this.baseUrl, this.apiKey, this.timeout);
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
    return _track(
      this.eventsUrl,
      this.apiKey,
      customerId,
      event,
      metadata,
      opts,
      this.timeout,
    );
  }

  async can(
    customerId: string,
    feature: string,
    metadata?: Record<string, string>,
  ): Promise<CanResult> {
    return _can(
      this.baseUrl,
      this.apiKey,
      customerId,
      feature,
      metadata,
      this.timeout,
    );
  }

  async plans(): Promise<Plan[]> {
    const res = await fetch(`${this.baseUrl}/api/v1/plans`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!res.ok)
      throw new Error(`plans failed: ${res.status} ${res.statusText}`);
    const data = await res.json();
    return data.plans ?? [];
  }

  async checkout(
    customerId: string,
    planCode: string,
    successUrl?: string,
  ): Promise<CheckoutResult> {
    const res = await fetch(`${this.baseUrl}/api/v1/checkout`, {
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
    if (!res.ok)
      throw new Error(`checkout failed: ${res.status} ${res.statusText}`);
    return res.json();
  }

  async subscribe(
    customerId: string,
    planCode: string,
  ): Promise<SubscribeResult> {
    if (!this.apiKey.startsWith("sk_")) {
      throw new Error("subscribe requires a secret key");
    }
    const res = await fetch(`${this.baseUrl}/api/v1/subscribe`, {
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
    if (!res.ok)
      throw new Error(`subscribe failed: ${res.status} ${res.statusText}`);
    return res.json();
  }

  async ping(): Promise<PingResult> {
    const res = await fetch(`${this.baseUrl}/api/v1/ping`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!res.ok)
      throw new Error(`ping failed: ${res.status} ${res.statusText}`);
    return res.json();
  }

  async checkAndDeduct(
    params: CheckAndDeductParams,
  ): Promise<CheckAndDeductResult> {
    const res = await fetch(`${this.baseUrl}/api/v1/check-and-deduct`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        customer_id: params.customerId,
        feature: params.feature,
        credits: params.credits,
      }),
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!res.ok)
      throw new Error(`checkAndDeduct failed: ${res.status} ${res.statusText}`);
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

class CustomersNamespace {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly timeout: number,
  ) {}

  async upsert(params: CustomerUpsertParams): Promise<CustomerUpsertResult> {
    const res = await fetch(`${this.baseUrl}/api/v1/customers`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        external_id: params.externalId,
        name: params.name,
        email: params.email,
      }),
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!res.ok)
      throw new Error(
        `customers.upsert failed: ${res.status} ${res.statusText}`,
      );
    return res.json();
  }
}
