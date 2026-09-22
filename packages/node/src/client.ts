import { can as _can } from "./can";
import { CreditsNamespace } from "./credits";
import { CostEventsNamespace } from "./cost-events";
import { CreditSystemsNamespace } from "./credit-systems";
import { EntitiesNamespace } from "./entities";
import { EntitySubscriptionsNamespace } from "./entity-subscriptions";
import { EventsNamespace } from "./events";
import { MarginClient } from "./margin";
import { track as _track } from "./track";
import { UsageNamespace } from "./usage";
import type {
  NozleConfig,
  CanResult,
  TrackOptions,
  Plan,
  CheckoutResult,
  CheckoutOptions,
  CheckoutStatus,
  SubscriptionCheckoutScope,
  SubscriptionOptions,
  SubscriptionChangePreview,
  WithdrawPendingSubscriptionChangeResult,
  RazorpayVerification,
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

function trimTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url.charCodeAt(end - 1) === 47) end -= 1;
  return url.slice(0, end);
}

export class Nozle {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly eventsUrl: string;
  readonly margin: MarginClient;
  readonly events: EventsNamespace;
  readonly costEvents: CostEventsNamespace;
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
    this.baseUrl = trimTrailingSlashes(config.baseUrl ?? "https://api.nozle.app/engine");
    this.eventsUrl = trimTrailingSlashes(config.eventsUrl ?? "https://api.nozle.app/core");
    this.timeout = config.timeout ?? 10_000;
    this.margin = new MarginClient(this.baseUrl, this.apiKey, this.timeout);
    this.events = new EventsNamespace();
    this.costEvents = new CostEventsNamespace(this.baseUrl, this.apiKey, this.timeout);
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
  ): Promise<string> {
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

  async checkout(
    customerId: string,
    planCode: string,
    returnUrl?: string,
    options: CheckoutOptions = {},
  ): Promise<CheckoutResult> {
    if (options.subscriptionId !== undefined && !options.subscriptionId.trim())
      throw new Error("checkout requires a non-empty subscriptionId");
    if (options.quoteId !== undefined && (!options.quoteId.trim() || !options.subscriptionId))
      throw new Error("checkout quoteId requires an explicit subscriptionId");
    return this.checkoutRequest(
      "POST",
      "",
      {
        plan_code: planCode,
        customer_id: customerId,
        ...(options.subscriptionId && { subscription_id: options.subscriptionId }),
        ...(options.quoteId && { quote_id: options.quoteId }),
        ...(returnUrl && { return_url: returnUrl }),
        ...(options.registerMandate !== undefined && {
          register_mandate: options.registerMandate,
        }),
        ...(options.externalEntityId && {
          external_entity_id: options.externalEntityId,
        }),
      },
      options.idempotencyKey,
    );
  }

  async checkoutInvoice(
    invoiceId: string,
    options: CheckoutOptions = {},
  ): Promise<CheckoutResult> {
    if (!invoiceId.trim())
      throw new Error("checkoutInvoice requires invoiceId");
    return this.checkoutRequest(
      "POST",
      "",
      {
        invoice_id: invoiceId,
        ...(options.registerMandate !== undefined && {
          register_mandate: options.registerMandate,
        }),
      },
      options.idempotencyKey,
    );
  }

  async verifyCheckout(
    checkoutId: string,
    verification: RazorpayVerification,
    scope?: SubscriptionCheckoutScope,
  ): Promise<CheckoutStatus> {
    if (!checkoutId.trim())
      throw new Error("verifyCheckout requires checkoutId");
    return this.checkoutRequest(
      "POST",
      `/${encodeURIComponent(checkoutId)}/verify${this.checkoutScopeQuery(scope)}`,
      verification,
    );
  }

  async checkoutStatus(checkoutId: string, scope?: SubscriptionCheckoutScope): Promise<CheckoutStatus> {
    if (!checkoutId.trim())
      throw new Error("checkoutStatus requires checkoutId");
    return this.checkoutRequest("GET", `/${encodeURIComponent(checkoutId)}${this.checkoutScopeQuery(scope)}`);
  }

  private checkoutScopeQuery(scope?: SubscriptionCheckoutScope): string {
    if (!scope) return "";
    if (!scope.customerId.trim() || !scope.subscriptionId.trim())
      throw new Error("checkout scope requires customerId and subscriptionId");
    return `?${new URLSearchParams({ customer_id: scope.customerId, subscription_id: scope.subscriptionId })}`;
  }

  async subscriptionOptions(customerId: string, subscriptionId: string): Promise<SubscriptionOptions> {
    const query = this.checkoutScopeQuery({ customerId, subscriptionId });
    return this.subscriptionManagementRequest("GET", `/api/v1/subscriptions/options${query}`);
  }

  async previewSubscriptionChange(customerId: string, subscriptionId: string, planCode: string): Promise<SubscriptionChangePreview> {
    this.checkoutScopeQuery({ customerId, subscriptionId });
    if (!planCode.trim()) throw new Error("previewSubscriptionChange requires planCode");
    return this.subscriptionManagementRequest("POST", "/api/v1/subscriptions/preview", {
      customer_id: customerId, subscription_id: subscriptionId, plan_code: planCode,
    });
  }

  async withdrawPendingSubscriptionChange(customerId: string, subscriptionId: string, pendingSubscriptionId: string, idempotencyKey: string): Promise<WithdrawPendingSubscriptionChangeResult> {
    this.checkoutScopeQuery({ customerId, subscriptionId });
    if (!pendingSubscriptionId.trim()) throw new Error("withdrawPendingSubscriptionChange requires pendingSubscriptionId");
    if (!idempotencyKey.trim() || new TextEncoder().encode(idempotencyKey).length > 255)
      throw new Error("withdrawPendingSubscriptionChange requires an Idempotency-Key up to 255 bytes");
    return this.subscriptionManagementRequest("POST", "/api/v1/subscriptions/transitions/withdraw", {
      customer_id: customerId, subscription_id: subscriptionId, pending_subscription_id: pendingSubscriptionId,
    }, idempotencyKey);
  }

  private async subscriptionManagementRequest<T>(method: string, path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
    if (!this.apiKey.startsWith("sk_")) throw new Error("subscription management requires a secret key");
    const response = await fetch(`${this.baseUrl}${path}`, {
      method, headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json",
        ...(idempotencyKey && { "Idempotency-Key": idempotencyKey }) },
      ...(body !== undefined && { body: JSON.stringify(body) }), signal: AbortSignal.timeout(this.timeout),
    });
    if (!response.ok) throw new Error(`subscriptionManagement failed: ${response.status} ${response.statusText}`);
    return response.json();
  }

  private async checkoutRequest<T>(
    method: string,
    suffix: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<T> {
    if (!this.apiKey.startsWith("sk_"))
      throw new Error("checkout requires a secret key");
    if (
      idempotencyKey !== undefined &&
      (!idempotencyKey.trim() || idempotencyKey.length > 255)
    ) {
      throw new Error("checkout requires a valid idempotencyKey");
    }
    const res = await fetch(`${this.baseUrl}/api/v1/checkout${suffix}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...(idempotencyKey && { "Idempotency-Key": idempotencyKey }),
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!res.ok)
      throw new Error(`checkout failed: ${res.status} ${res.statusText}`);
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
    if (params.quoteId !== undefined && (params.operation !== "downgrade" || !params.quoteId.trim()))
      throw new Error("quoteId requires a downgrade transition");
    if (params.expectedEffectiveAt !== undefined) {
      if (params.operation !== "cancel" || params.timing !== "end_of_period") {
        throw new Error("expectedEffectiveAt requires end_of_period cancellation");
      }
      if (
        typeof params.expectedEffectiveAt !== "string" ||
        !/^\d{4}-\d\d-\d\dT.+(?:Z|[+-]\d\d:\d\d)$/.test(params.expectedEffectiveAt) ||
        !Number.isFinite(Date.parse(params.expectedEffectiveAt))
      ) {
        throw new Error("expectedEffectiveAt requires an ISO timestamp with timezone");
      }
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
      expected_effective_at: params.expectedEffectiveAt,
      quote_id: params.quoteId,
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
