import { request, type RequestPolicy } from "./http";
import { can as _can } from "./can";
import { captureFetch as _captureFetch, type CaptureFetchOptions } from "./capture-fetch";
import { CreditsNamespace } from "./credits";
import { CostEventsNamespace } from "./cost-events";
import { CostIntelligenceNamespace } from "./cost-intelligence";
import { CreditSystemsNamespace } from "./credit-systems";
import { EntitiesNamespace } from "./entities";
import { EntitySubscriptionsNamespace } from "./entity-subscriptions";
import { apiError, subscriptionError } from "./errors";
import { EventsNamespace } from "./events";
import { MarginClient } from "./margin";
import { recordUsage as _recordUsage, type RecordUsageParams } from "./provider-usage";
import { track as _track } from "./track";
import { UsageNamespace } from "./usage";
import { WebhooksNamespace } from "./webhooks";
import { InvoicesNamespace } from "./invoices";
import { AlertsNamespace } from "./alerts";
import { PlanVersionsNamespace } from "./plan-versions";
import type {
  NozleConfig,
  CanOptions,
  CanResult,
  CoreSubscription,
  CustomerUsage,
  TrackOptions,
  Plan,
  CheckoutResult,
  CheckoutOptions,
  ManagePaymentMethodResult,
  CheckoutStatus,
  SubscriptionCheckoutScope,
  SubscriptionOptions,
  SubscriptionChangePreview,
  WithdrawPendingSubscriptionChangeResult,
  RazorpayVerification,
  SubscribeOptions,
  SubscribeResult,
  CancellationPolicy,
  CancelSubscriptionOptions,
  CancelSubscriptionResult,
  SubscriptionTransitionParams,
  SubscriptionTransitionPreview,
  SubscriptionTransitionResult,
  PingResult,
  CustomerUpsertParams,
  CustomerUpsertResult,
  CheckAndDeductParams,
  CheckAndDeductResult,
  CreditBalanceImportParams,
  CreditBalanceImport,
  BillingStateImportParams,
  BillingStateImport,
  ImportOptions,
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
  /** Ledger-backed cost report and Shared Period Cost allocation (secret keys). */
  readonly costIntelligence: CostIntelligenceNamespace;
  readonly customers: CustomersNamespace;
  readonly creditSystems: CreditSystemsNamespace;
  readonly entities: EntitiesNamespace;
  readonly entitySubscriptions: EntitySubscriptionsNamespace;
  readonly credits: CreditsNamespace;
  readonly usage: UsageNamespace;
  /** Verifies webhooks Nozle sends to your endpoint. */
  readonly webhooks: WebhooksNamespace;
  /** A customer's invoices and their PDFs. */
  readonly invoices: InvoicesNamespace;
  /** Usage and wallet-balance alerts; Nozle sends `alert.triggered` when one fires. */
  readonly alerts: AlertsNamespace;
  /** The versions of a plan code and the migrations that move subscribers between them (secret keys). */
  readonly planVersions: PlanVersionsNamespace;

  private readonly policy: RequestPolicy;
  private subCache = new Map<string, string>();

  constructor(config: NozleConfig = {}) {
    const apiKey = config.apiKey ?? (typeof process === "undefined" ? undefined : process.env?.NOZLE_SECRET_KEY);
    if (apiKey === undefined) throw new Error("Nozle: pass apiKey or set the NOZLE_SECRET_KEY environment variable");
    this.apiKey = apiKey;
    const host = trimTrailingSlashes(config.host ?? "https://api.nozle.app");
    this.baseUrl = trimTrailingSlashes(config.baseUrl ?? `${host}/engine`);
    this.eventsUrl = trimTrailingSlashes(config.eventsUrl ?? `${host}/core`);
    this.policy = {
      timeout: config.timeout ?? 10_000,
      maxRetries: Math.max(0, Math.trunc(config.maxRetries ?? 0)),
      retryDelayMs: config.retryDelayMs ?? 500,
    };
    this.margin = new MarginClient(this.baseUrl, this.apiKey, this.policy);
    this.events = new EventsNamespace();
    this.costEvents = new CostEventsNamespace(this.baseUrl, this.apiKey, this.policy);
    this.costIntelligence = new CostIntelligenceNamespace(this.baseUrl, this.apiKey, this.policy);
    this.customers = new CustomersNamespace(this.eventsUrl, this.apiKey, this.policy, this.baseUrl);
    this.creditSystems = new CreditSystemsNamespace(this.eventsUrl, this.apiKey, this.policy);
    this.entities = new EntitiesNamespace(this.baseUrl, this.apiKey, this.policy);
    this.entitySubscriptions = new EntitySubscriptionsNamespace(this.eventsUrl, this.apiKey, this.policy);
    this.credits = new CreditsNamespace(this.baseUrl, this.apiKey, this.policy);
    this.usage = new UsageNamespace(this.baseUrl, this.apiKey, this.policy);
    this.webhooks = new WebhooksNamespace(this.eventsUrl, this.apiKey, this.policy);
    this.invoices = new InvoicesNamespace(this.eventsUrl, this.apiKey, this.policy);
    this.alerts = new AlertsNamespace(this.eventsUrl, this.apiKey, this.policy);
    this.planVersions = new PlanVersionsNamespace(this.eventsUrl, this.apiKey, this.policy);
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
    return _track(this.baseUrl, this.apiKey, customerId, event, metadata, opts, this.policy);
  }

  async can(customerId: string, feature: string, metadata?: Record<string, string>, options?: CanOptions): Promise<CanResult> {
    return _can(this.baseUrl, this.apiKey, customerId, feature, metadata, this.policy, options);
  }

  /**
   * Current plan versions. A secret key gets every plan, including families hidden from the
   * pricing table; `includeHidden: false` gets the pricing table view a publishable key gets.
   */
  async plans(options: { includeHidden?: boolean } = {}): Promise<Plan[]> {
    const url = new URL(`${this.baseUrl}/api/v1/plans`);
    if (options.includeHidden !== undefined) url.searchParams.set("include_hidden", String(options.includeHidden));
    const res = await request(this.policy, url.toString(), {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) throw await apiError(`plans`, res);
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
    const result = await this.checkoutRequest<CheckoutResult>(
      "checkout",
      "POST",
      "",
      {
        plan_code: planCode,
        customer_id: customerId,
        ...(options.subscriptionId && { subscription_id: options.subscriptionId }),
        ...(options.quoteId && { quote_id: options.quoteId }),
        ...(returnUrl && { return_url: returnUrl }),
        ...(options.cancelUrl && { cancel_url: options.cancelUrl }),
        ...(options.registerMandate !== undefined && {
          register_mandate: options.registerMandate,
        }),
        ...(options.externalEntityId && {
          external_entity_id: options.externalEntityId,
        }),
      },
      options.idempotencyKey,
    );
    this.subCache.delete(customerId); // the paid or scheduled change may replace the active subscription
    return result;
  }

  async checkoutInvoice(
    invoiceId: string,
    options: CheckoutOptions = {},
  ): Promise<CheckoutResult> {
    if (!invoiceId.trim())
      throw new Error("checkoutInvoice requires invoiceId");
    const result = await this.checkoutRequest<CheckoutResult>(
      "checkoutInvoice",
      "POST",
      "",
      {
        invoice_id: invoiceId,
        ...(options.cancelUrl && { cancel_url: options.cancelUrl }),
        ...(options.registerMandate !== undefined && {
          register_mandate: options.registerMandate,
        }),
      },
      options.idempotencyKey,
    );
    this.subCache.clear(); // an invoice carries no customer id here, so drop every entry
    return result;
  }

  async managePaymentMethod(
    customerId: string,
    returnUrl?: string,
    options: Pick<CheckoutOptions, "idempotencyKey"> = {},
  ): Promise<ManagePaymentMethodResult> {
    if (!this.apiKey.startsWith("sk_"))
      throw new Error("managePaymentMethod requires a secret key");
    if (!customerId.trim())
      throw new Error("managePaymentMethod requires customerId");
    const { idempotencyKey } = options;
    if (idempotencyKey !== undefined && (!idempotencyKey.trim() || idempotencyKey.length > 255))
      throw new Error("managePaymentMethod requires a valid idempotencyKey");
    const res = await request(
      this.policy,
      `${this.baseUrl}/api/v1/customers/${encodeURIComponent(customerId)}/payment-method/manage`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          ...(idempotencyKey && { "Idempotency-Key": idempotencyKey }),
        },
        ...(returnUrl && { body: JSON.stringify({ return_url: returnUrl }) }),
      },
    );
    if (!res.ok) throw await apiError("managePaymentMethod", res);
    return (await res.json()).manage_payment_method;
  }

  async verifyCheckout(
    checkoutId: string,
    verification: RazorpayVerification,
    scope?: SubscriptionCheckoutScope,
  ): Promise<CheckoutStatus> {
    if (!checkoutId.trim())
      throw new Error("verifyCheckout requires checkoutId");
    for (const field of ["razorpay_order_id", "razorpay_payment_id", "razorpay_signature"] as const)
      if (typeof verification?.[field] !== "string" || !verification[field].trim())
        throw new Error(`verifyCheckout requires ${field}`);
    const status = await this.checkoutRequest<CheckoutStatus>(
      "verifyCheckout",
      "POST",
      `/${encodeURIComponent(checkoutId)}/verify${this.checkoutScopeQuery(scope)}`,
      verification,
    );
    if (scope) this.subCache.delete(scope.customerId);
    return status;
  }

  /**
   * Status of a paid upgrade (pass its `plan_upgrade_intent_id` with the customer and subscription scope) or of a
   * Razorpay operation. Not a Stripe `checkout_id` (`cs_...`): a new-subscription or invoice Stripe checkout has no
   * status call, so confirm it through webhooks or by reloading billing state.
   */
  async checkoutStatus(checkoutId: string, scope?: SubscriptionCheckoutScope): Promise<CheckoutStatus> {
    if (!checkoutId.trim())
      throw new Error("checkoutStatus requires checkoutId");
    const status = await this.checkoutRequest<CheckoutStatus>("checkoutStatus", "GET", `/${encodeURIComponent(checkoutId)}${this.checkoutScopeQuery(scope)}`);
    if (scope) this.subCache.delete(scope.customerId); // payment may have activated a new subscription
    return status;
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
    const response = await request(this.policy, `${this.baseUrl}${path}`, {
      method, headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json",
        ...(idempotencyKey && { "Idempotency-Key": idempotencyKey }) },
      ...(body !== undefined && { body: JSON.stringify(body) })
    });
    if (!response.ok) throw await apiError(`subscriptionManagement`, response);
    return response.json();
  }

  private async checkoutRequest<T>(
    operation: string,
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
    const res = await request(this.policy, `${this.baseUrl}/api/v1/checkout${suffix}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...(idempotencyKey && { "Idempotency-Key": idempotencyKey }),
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    if (!res.ok)
      throw await apiError(operation, res);
    return res.json();
  }

  /**
   * Subscribes the customer to the current version of the plan, or to `options.planVersion` (for example to keep
   * selling an older price). The same customer and code again keep the subscription's own version.
   */
  async subscribe(customerId: string, planCode: string, options: SubscribeOptions = {}): Promise<SubscribeResult> {
    if (!this.apiKey.startsWith("sk_")) {
      throw new Error("subscribe requires a secret key");
    }
    const { planVersion } = options;
    if (planVersion !== undefined && (!Number.isInteger(planVersion) || planVersion < 1)) {
      throw new Error("planVersion must be an integer of 1 or more");
    }
    const res = await request(this.policy, `${this.baseUrl}/api/v1/subscribe`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        plan_code: planCode,
        customer_id: customerId,
        ...(planVersion !== undefined && { plan_version: planVersion }),
      }),
    });
    if (!res.ok) throw await apiError(`subscribe`, res);
    this.subCache.delete(customerId);
    return res.json();
  }

  async cancelSubscription(
    customerId: string,
    subscriptionId: string,
    policyOrOptions: CancellationPolicy | CancelSubscriptionOptions = {},
  ): Promise<CancelSubscriptionResult> {
    if (!this.apiKey.startsWith("sk_")) {
      throw new Error("cancelSubscription requires a secret key");
    }
    if (!customerId.trim() || !subscriptionId.trim()) {
      throw new Error("cancelSubscription requires customerId and subscriptionId");
    }
    const options = typeof policyOrOptions === "string" ? { policy: policyOrOptions } : policyOrOptions;
    if (options.policy !== undefined && options.policy !== "end_of_period" && options.policy !== "immediate") {
      throw new Error("cancelSubscription policy must be end_of_period or immediate");
    }
    // Options left out are not sent, so the organization's cancellation settings apply to them.
    const query = new URLSearchParams({ customer_id: customerId });
    for (const [param, value] of Object.entries({
      cancellation_policy: options.policy,
      credit_action: options.creditAction,
      refund_mode: options.refundMode,
      final_invoice_action: options.finalInvoiceAction,
    })) {
      if (value) query.set(param, value);
    }
    const res = await request(this.policy, 
      `${this.baseUrl}/api/v1/subscriptions/${encodeURIComponent(subscriptionId)}?${query}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${this.apiKey}` },
      },
    );
    if (!res.ok) {
      throw await apiError(`cancelSubscription`, res);
    }
    this.subCache.delete(customerId);
    return res.json();
  }

  async previewSubscriptionTransition(
    params: SubscriptionTransitionParams,
  ): Promise<SubscriptionTransitionPreview> {
    this.validateSubscriptionTransition(params);
    const res = await request(this.policy, `${this.baseUrl}/api/v1/subscriptions/transitions/preview`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(this.subscriptionTransitionBody(params)),
    }, { idempotent: true });
    if (!res.ok) {
      throw await apiError(`previewSubscriptionTransition`, res);
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
    const res = await request(this.policy, `${this.baseUrl}/api/v1/subscriptions/transitions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(this.subscriptionTransitionBody(params)),
    });
    if (!res.ok) {
      throw await apiError(`applySubscriptionTransition`, res);
    }
    this.subCache.delete(params.customerId);
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

  /**
   * Returns a `fetch` that records the token usage of every LLM response it sees. Pass it as the
   * `fetch` option of the OpenAI or Anthropic SDK, a Vercel AI SDK provider, LangChain, or any
   * client that accepts one. See {@link CaptureFetchOptions}.
   */
  captureFetch(options: CaptureFetchOptions = {}, fetchImpl: typeof fetch = globalThis.fetch): typeof fetch {
    return _captureFetch(this, options, fetchImpl);
  }

  /** Records one LLM call's token usage that your code read itself. */
  recordUsage(params: RecordUsageParams): Promise<void> {
    return _recordUsage(this, params);
  }

  async ping(): Promise<PingResult> {
    const res = await request(this.policy, `${this.baseUrl}/api/v1/ping`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) throw await apiError(`ping`, res);
    return res.json();
  }

  /**
   * Legacy wallet adapter: deducts `credits` from the customer's wallet.
   *
   * @deprecated Use {@link Nozle.usage}`.check()` and `.track()` with a credit system, which keep
   * metric conversion, source ordering, idempotency and the credit ledger authoritative.
   */
  async checkAndDeduct(params: CheckAndDeductParams): Promise<CheckAndDeductResult> {
    const res = await request(this.policy, `${this.baseUrl}/api/v1/check-and-deduct`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        customer_id: params.customerId,
        credits: params.credits,
      }),
    });
    if (!res.ok) throw await apiError(`checkAndDeduct`, res);
    return res.json();
  }

  /** The customer's active subscriptions, from Core. */
  async getSubscriptions(customerId: string): Promise<CoreSubscription[]> {
    if (!this.apiKey.startsWith("sk_")) throw new Error("getSubscriptions requires a secret key");
    if (!customerId.trim()) throw new Error("getSubscriptions requires customerId");
    const res = await request(this.policy,
      `${this.eventsUrl}/api/v1/subscriptions?external_customer_id=${encodeURIComponent(customerId)}&status[]=active`,
      { headers: { Authorization: `Bearer ${this.apiKey}` } },
    );
    if (!res.ok) throw await apiError("getSubscriptions", res);
    return ((await res.json()) as { subscriptions?: CoreSubscription[] }).subscriptions ?? [];
  }

  /** Usage of the current billing period. Without `subscriptionId`, the one active subscription is used. */
  async currentUsage(customerId: string, options: { subscriptionId?: string } = {}): Promise<CustomerUsage> {
    if (!this.apiKey.startsWith("sk_")) throw new Error("currentUsage requires a secret key");
    const subscriptionId = options.subscriptionId ?? (await this.resolveSubscription(customerId));
    const res = await request(this.policy,
      `${this.eventsUrl}/api/v1/customers/${encodeURIComponent(customerId)}/current_usage?external_subscription_id=${encodeURIComponent(subscriptionId)}`,
      { headers: { Authorization: `Bearer ${this.apiKey}` } },
    );
    if (!res.ok) throw await apiError("currentUsage", res);
    return ((await res.json()) as { customer_usage: CustomerUsage }).customer_usage;
  }

  /** Usage of past billing periods, newest first. `periods` limits how many (Core default otherwise). */
  async pastUsage(
    customerId: string,
    options: { subscriptionId?: string; periods?: number } = {},
  ): Promise<CustomerUsage[]> {
    if (!this.apiKey.startsWith("sk_")) throw new Error("pastUsage requires a secret key");
    const subscriptionId = options.subscriptionId ?? (await this.resolveSubscription(customerId));
    const query = new URLSearchParams({ external_subscription_id: subscriptionId });
    if (options.periods !== undefined) query.set("periods_count", String(options.periods));
    const res = await request(this.policy,
      `${this.eventsUrl}/api/v1/customers/${encodeURIComponent(customerId)}/past_usage?${query}`,
      { headers: { Authorization: `Bearer ${this.apiKey}` } },
    );
    if (!res.ok) throw await apiError("pastUsage", res);
    return ((await res.json()) as { usage_periods?: CustomerUsage[] }).usage_periods ?? [];
  }

  private async resolveSubscription(customerId: string): Promise<string> {
    const cached = this.subCache.get(customerId);
    if (cached) return cached;

    const res = await request(this.policy, 
      `${this.eventsUrl}/api/v1/subscriptions?external_customer_id=${encodeURIComponent(customerId)}&status[]=active`,
      {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      },
    );
    if (!res.ok) throw await apiError("subscription lookup", res);

    const data = await res.json();
    const subs = data.subscriptions ?? [];

    if (subs.length === 0) {
      throw subscriptionError("active_subscription_not_found", `No active subscription for customer '${customerId}'`);
    }
    if (subs.length > 1) {
      throw subscriptionError(
        "active_subscription_ambiguous",
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
    private readonly policy: RequestPolicy,
    private readonly engineUrl: string,
  ) {}

  /**
   * Records the opening credit balance of a subscription imported with {@link importBillingState},
   * without an invoice or a usage event (Engine). Retry an uncertain call with the same key and body.
   */
  async importCreditBalance(
    customerId: string,
    params: CreditBalanceImportParams,
    options: ImportOptions,
  ): Promise<CreditBalanceImport> {
    const payload = await this.importRequest<{ credit_balance_import: CreditBalanceImport }>(
      "customers.importCreditBalance",
      `${this.engineUrl}/api/v1/customers/${encodeURIComponent(customerId)}/credit-balance-imports`,
      customerId,
      {
        external_subscription_id: params.externalSubscriptionId,
        credit_system_code: params.creditSystemCode,
        granted_amount: params.grantedAmount,
        remaining_amount: params.remainingAmount,
        external_entity_id: params.externalEntityId,
        dry_run: params.dryRun,
      },
      options,
    );
    return payload.credit_balance_import;
  }

  /**
   * Imports a subscription another system already bills (`billing_authority: external`), without an
   * invoice, checkout or payment (Core). Retry an uncertain call with the same key and body.
   */
  async importBillingState(
    customerId: string,
    params: BillingStateImportParams,
    options: ImportOptions,
  ): Promise<BillingStateImport> {
    const sub = params.subscription;
    const payload = await this.importRequest<{ billing_state_import: BillingStateImport }>(
      "customers.importBillingState",
      `${this.baseUrl}/api/v1/customers/${encodeURIComponent(customerId)}/billing-state-imports`,
      customerId,
      {
        billing_state_import: {
          dry_run: params.dryRun,
          external_entity_id: params.externalEntityId,
          subscription: sub && {
            plan_code: sub.planCode,
            status: sub.status,
            billing_authority: sub.billingAuthority,
            external_reference: sub.externalReference,
            current_period_start: sub.currentPeriodStart,
            current_period_end: sub.currentPeriodEnd,
          },
        },
      },
      options,
    );
    return payload.billing_state_import;
  }

  private async importRequest<T>(
    operation: string,
    url: string,
    customerId: string,
    body: unknown,
    options: ImportOptions,
  ): Promise<T> {
    if (!this.apiKey.startsWith("sk_")) throw new Error(`${operation} requires a secret key`);
    if (!customerId?.trim()) throw new Error(`${operation} requires customerId`);
    const key = options?.idempotencyKey;
    if (typeof key !== "string" || !key.trim() || new TextEncoder().encode(key).length > 255)
      throw new Error(`${operation} requires an idempotencyKey up to 255 bytes`);
    const res = await request(this.policy, url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw await apiError(operation, res);
    return res.json();
  }

  async upsert(params: CustomerUpsertParams): Promise<CustomerUpsertResult> {
    if (!this.apiKey.startsWith("sk_")) {
      throw new Error("customers.upsert requires a secret key");
    }
    if (!params.externalId?.trim()) {
      throw new Error("customers.upsert requires externalId");
    }
    const billing = params.billingConfiguration;
    if (billing && !billing.paymentProvider?.trim()) {
      throw new Error("customers.upsert billingConfiguration requires paymentProvider");
    }
    const res = await request(this.policy, `${this.baseUrl}/api/v1/customers`, {
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
          billing_configuration: billing && {
            payment_provider: billing.paymentProvider,
            payment_provider_code: billing.paymentProviderCode,
            provider_customer_id: billing.providerCustomerId,
            sync_with_provider: billing.syncWithProvider,
            provider_payment_methods: billing.providerPaymentMethods,
          },
        },
      }),
    }, { idempotent: true });
    if (!res.ok) throw await apiError(`customers.upsert`, res);
    const payload = (await res.json()) as { customer: CustomerUpsertResult };
    return payload.customer;
  }
}
