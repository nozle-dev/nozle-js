import { can as _can } from "./can";
import { CreditsNamespace } from "./credits";
import { CreditSystemsNamespace } from "./credit-systems";
import { EntitiesNamespace } from "./entities";
import { EntitySubscriptionsNamespace } from "./entity-subscriptions";
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
  CancellationPolicy,
  CancelSubscriptionResult,
  SubscriptionTransitionParams,
  SubscriptionTransitionPreview,
  SubscriptionTransitionResult,
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
  readonly creditSystems: CreditSystemsNamespace;
  readonly entities: EntitiesNamespace;
  readonly entitySubscriptions: EntitySubscriptionsNamespace;
  readonly credits: CreditsNamespace;
  readonly usage: UsageNamespace;

  private readonly timeout: number;
  private subCache = new Map<string, string>();

  constructor(config: NozleConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? "http://localhost:8080").replace(/\/+$/, "");
    this.eventsUrl = (config.eventsUrl ?? "http://localhost:3000").replace(/\/+$/, "");
    this.timeout = config.timeout ?? 10_000;
    this.margin = new MarginClient(this.baseUrl, this.apiKey, this.timeout);
    this.customers = new CustomersNamespace(this.eventsUrl, this.apiKey, this.timeout);
    this.creditSystems = new CreditSystemsNamespace(this.eventsUrl, this.apiKey, this.timeout);
    this.entities = new EntitiesNamespace(this.baseUrl, this.apiKey, this.timeout);
    this.entitySubscriptions = new EntitySubscriptionsNamespace(this.eventsUrl, this.apiKey, this.timeout);
    this.credits = new CreditsNamespace(this.baseUrl, this.apiKey, this.timeout);
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
    return _track(this.eventsUrl, this.apiKey, customerId, event, metadata, opts, this.timeout);
  }

  async can(customerId: string, feature: string, metadata?: Record<string, string>): Promise<CanResult> {
    return _can(this.baseUrl, this.apiKey, customerId, feature, metadata, this.timeout);
  }

  async plans(): Promise<Plan[]> {
    const res = await fetch(`${this.baseUrl}/api/v1/plans`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!res.ok) throw new Error(`plans failed: ${res.status} ${res.statusText}`);
    const data = await res.json();
    return data.plans ?? [];
  }

  async checkout(customerId: string, planCode: string, returnUrl?: string): Promise<CheckoutResult> {
    if (!this.apiKey.startsWith("sk_")) {
      throw new Error("checkout requires a secret key");
    }
    const res = await fetch(`${this.baseUrl}/api/v1/checkout`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        plan_code: planCode,
        customer_id: customerId,
        ...(returnUrl && { return_url: returnUrl }),
      }),
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!res.ok) throw new Error(`checkout failed: ${res.status} ${res.statusText}`);
    return res.json();
  }

  async subscribe(customerId: string, planCode: string): Promise<SubscribeResult> {
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
    if (!res.ok) throw new Error(`subscribe failed: ${res.status} ${res.statusText}`);
    return res.json();
  }

  async cancelSubscription(
    customerId: string,
    subscriptionId: string,
    policy: CancellationPolicy = "end_of_period",
  ): Promise<CancelSubscriptionResult> {
    if (!this.apiKey.startsWith("sk_")) {
      throw new Error("cancelSubscription requires a secret key");
    }
    if (!customerId.trim() || !subscriptionId.trim()) {
      throw new Error("cancelSubscription requires customerId and subscriptionId");
    }
    if (policy !== "end_of_period" && policy !== "immediate") {
      throw new Error("cancelSubscription policy must be end_of_period or immediate");
    }
    const query = new URLSearchParams({
      customer_id: customerId,
      cancellation_policy: policy,
    });
    const res = await fetch(
      `${this.baseUrl}/api/v1/subscriptions/${encodeURIComponent(subscriptionId)}?${query}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(this.timeout),
      },
    );
    if (!res.ok) {
      throw new Error(`cancelSubscription failed: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  async previewSubscriptionTransition(
    params: SubscriptionTransitionParams,
  ): Promise<SubscriptionTransitionPreview> {
    this.validateSubscriptionTransition(params);
    const res = await fetch(`${this.baseUrl}/api/v1/subscriptions/transitions/preview`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(this.subscriptionTransitionBody(params)),
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!res.ok) {
      throw new Error(`previewSubscriptionTransition failed: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  async applySubscriptionTransition(
    params: SubscriptionTransitionParams,
    idempotencyKey: string,
  ): Promise<SubscriptionTransitionResult> {
    this.validateSubscriptionTransition(params);
    if (!idempotencyKey.trim() || new TextEncoder().encode(idempotencyKey).length > 255) {
      throw new Error("applySubscriptionTransition requires an Idempotency-Key up to 255 bytes");
    }
    const res = await fetch(`${this.baseUrl}/api/v1/subscriptions/transitions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(this.subscriptionTransitionBody(params)),
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!res.ok) {
      throw new Error(`applySubscriptionTransition failed: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  private validateSubscriptionTransition(params: SubscriptionTransitionParams): void {
    if (!this.apiKey.startsWith("sk_")) {
      throw new Error("subscription transitions require a secret key");
    }
    if (!params.customerId.trim() || !params.subscriptionId.trim()) {
      throw new Error("subscription transitions require customerId and subscriptionId");
    }
    if ((params.operation === "cancel" || params.operation === "uncancel") && params.targetPlanCode) {
      throw new Error("targetPlanCode is forbidden for cancellation and uncancel");
    }
    if (params.operation === "downgrade" && !params.targetPlanCode?.trim()) {
      throw new Error("targetPlanCode is required for downgrade");
    }
    if (params.timing === "end_of_period" && params.creditAction && params.creditAction !== "none") {
      throw new Error("end_of_period transitions require creditAction none");
    }
    if (params.refundMode === "full" && params.creditAction !== "refund") {
      throw new Error("full refundMode requires creditAction refund");
    }
    if (
      params.operation === "uncancel" &&
      (params.timing ||
        params.billingAnchor ||
        params.prorationBehavior ||
        params.creditAction ||
        params.refundMode ||
        params.finalInvoiceAction)
    ) {
      throw new Error("uncancel does not accept settlement options");
    }
  }

  private subscriptionTransitionBody(params: SubscriptionTransitionParams): Record<string, unknown> {
    return {
      customer_id: params.customerId,
      subscription_id: params.subscriptionId,
      operation: params.operation,
      timing: params.timing,
      target_plan_code: params.targetPlanCode,
      billing_anchor: params.billingAnchor,
      proration_behavior: params.prorationBehavior,
      credit_action: params.creditAction,
      refund_mode: params.refundMode,
      final_invoice_action: params.finalInvoiceAction,
    };
  }

  async ping(): Promise<PingResult> {
    const res = await fetch(`${this.baseUrl}/api/v1/ping`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!res.ok) throw new Error(`ping failed: ${res.status} ${res.statusText}`);
    return res.json();
  }

  async checkAndDeduct(params: CheckAndDeductParams): Promise<CheckAndDeductResult> {
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
    if (!res.ok) throw new Error(`checkAndDeduct failed: ${res.status} ${res.statusText}`);
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
    if (!this.apiKey.startsWith("sk_")) {
      throw new Error("customers.upsert requires a secret key");
    }
    if (!params.externalId?.trim()) {
      throw new Error("customers.upsert requires externalId");
    }
    const res = await fetch(`${this.baseUrl}/api/v1/customers`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        customer: {
          external_id: params.externalId,
          name: params.name,
          email: params.email,
        },
      }),
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!res.ok) throw new Error(`customers.upsert failed: ${res.status} ${res.statusText}`);
    const payload = (await res.json()) as { customer: CustomerUpsertResult };
    return payload.customer;
  }
}
