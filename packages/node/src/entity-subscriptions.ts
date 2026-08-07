import type {
  CheckoutResult,
  EntitySubscription,
  EntitySubscriptionCancelParams,
  EntitySubscriptionCancelResult,
  EntitySubscriptionCheckoutParams,
  EntitySubscriptionCheckoutManyParams,
  EntitySubscriptionCheckoutManyResult,
  EntitySubscriptionList,
} from "./types";

export class EntitySubscriptionsNamespace {
  constructor(
    private readonly coreUrl: string,
    private readonly apiKey: string,
    private readonly timeout: number,
  ) {}

  async ensure(customerId: string, entityId: string): Promise<EntitySubscription> {
    this.validatePath(customerId, entityId, "entitySubscriptions.ensure");
    return this.requestEntity("PUT", customerId, entityId, "entitySubscriptions.ensure");
  }

  async get(customerId: string, entityId: string): Promise<EntitySubscription> {
    this.validatePath(customerId, entityId, "entitySubscriptions.get");
    return this.requestEntity("GET", customerId, entityId, "entitySubscriptions.get");
  }

  async list(customerId: string): Promise<EntitySubscriptionList> {
    this.requireSecret("entitySubscriptions.list");
    requireValue(customerId, "customerId", "entitySubscriptions.list");
    const response = await fetch(
      `${this.coreUrl}/api/v1/customers/${encodeURIComponent(customerId)}/entity-subscriptions`,
      {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(this.timeout),
      },
    );
    if (!response.ok) throw requestError("entitySubscriptions.list", response);
    return response.json() as Promise<EntitySubscriptionList>;
  }

  async checkout(
    customerId: string,
    entityId: string,
    params: EntitySubscriptionCheckoutParams,
  ): Promise<CheckoutResult> {
    return this.change("checkout", customerId, entityId, params);
  }

  async checkoutMany(
    customerId: string,
    params: EntitySubscriptionCheckoutManyParams,
  ): Promise<EntitySubscriptionCheckoutManyResult> {
    const operation = "entitySubscriptions.checkoutMany";
    this.requireSecret(operation);
    requireValue(customerId, "customerId", operation);
    validateIdempotencyKey(params.idempotencyKey, operation);
    if (!Array.isArray(params.items) || params.items.length < 1 || params.items.length > 100) {
      throw new Error(`${operation} requires between 1 and 100 items`);
    }

    const entityIds = new Set<string>();
    for (const item of params.items) {
      requireValue(item.externalEntityId, "items[].externalEntityId", operation);
      requireValue(item.planCode, "items[].planCode", operation);
      const entityId = item.externalEntityId.trim();
      if (new TextEncoder().encode(entityId).length > 255) {
        throw new Error(`${operation} externalEntityId must not exceed 255 bytes`);
      }
      if (entityIds.has(entityId)) {
        throw new Error(`${operation} requires unique externalEntityId values`);
      }
      entityIds.add(entityId);
    }

    const response = await fetch(
      `${this.coreUrl}/api/v1/customers/${encodeURIComponent(customerId)}/entity-subscriptions/checkout`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": params.idempotencyKey,
        },
        body: JSON.stringify({
          entity_subscription_checkout: {
            billing_time: params.billingTime,
            return_url: params.returnUrl,
            items: params.items.map((item) => ({
              external_entity_id: item.externalEntityId,
              plan_code: item.planCode,
            })),
          },
        }),
        signal: AbortSignal.timeout(this.timeout),
      },
    );
    if (!response.ok) throw requestError(operation, response);
    const payload = (await response.json()) as {
      entity_subscription_checkout: EntitySubscriptionCheckoutManyResult;
    };
    return payload.entity_subscription_checkout;
  }

  async changePlan(
    customerId: string,
    entityId: string,
    params: EntitySubscriptionCheckoutParams,
  ): Promise<CheckoutResult> {
    return this.change("change-plan", customerId, entityId, params);
  }

  async cancel(
    customerId: string,
    entityId: string,
    params: EntitySubscriptionCancelParams,
  ): Promise<EntitySubscriptionCancelResult> {
    const operation = "entitySubscriptions.cancel";
    this.validatePath(customerId, entityId, operation);
    validateIdempotencyKey(params.idempotencyKey, operation);
    const response = await fetch(`${this.entityPath(customerId, entityId)}/cancel`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": params.idempotencyKey,
      },
      body: JSON.stringify({
        timing: params.timing,
        credit_action: params.creditAction,
        refund_mode: params.refundMode,
        final_invoice_action: params.finalInvoiceAction,
      }),
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!response.ok) throw requestError(operation, response);
    return response.json() as Promise<EntitySubscriptionCancelResult>;
  }

  async remove(customerId: string, entityId: string): Promise<void> {
    const operation = "entitySubscriptions.remove";
    this.validatePath(customerId, entityId, operation);
    const response = await fetch(this.entityPath(customerId, entityId), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${this.apiKey}` },
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!response.ok) throw requestError(operation, response);
  }

  private async change(
    action: "checkout" | "change-plan",
    customerId: string,
    entityId: string,
    params: EntitySubscriptionCheckoutParams,
  ): Promise<CheckoutResult> {
    const operation = `entitySubscriptions.${action === "checkout" ? "checkout" : "changePlan"}`;
    this.validatePath(customerId, entityId, operation);
    requireValue(params.planCode, "planCode", operation);
    if (params.idempotencyKey) validateIdempotencyKey(params.idempotencyKey, operation);
    const response = await fetch(`${this.entityPath(customerId, entityId)}/${action}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...(params.idempotencyKey && { "Idempotency-Key": params.idempotencyKey }),
      },
      body: JSON.stringify({
        plan_code: params.planCode,
        return_url: params.returnUrl,
        billing_time: params.billingTime,
      }),
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!response.ok) throw requestError(operation, response);
    return response.json() as Promise<CheckoutResult>;
  }

  private async requestEntity(
    method: "GET" | "PUT",
    customerId: string,
    entityId: string,
    operation: string,
  ): Promise<EntitySubscription> {
    const response = await fetch(this.entityPath(customerId, entityId), {
      method,
      headers: { Authorization: `Bearer ${this.apiKey}` },
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!response.ok) throw requestError(operation, response);
    const payload = (await response.json()) as { entity_subscription: EntitySubscription };
    return payload.entity_subscription;
  }

  private validatePath(customerId: string, entityId: string, operation: string): void {
    this.requireSecret(operation);
    requireValue(customerId, "customerId", operation);
    requireValue(entityId, "entityId", operation);
    if (new TextEncoder().encode(entityId.trim()).length > 255) {
      throw new Error(`${operation} entityId must not exceed 255 bytes`);
    }
  }

  private requireSecret(operation: string): void {
    if (!this.apiKey.startsWith("sk_")) throw new Error(`${operation} requires a secret key`);
  }

  private entityPath(customerId: string, entityId: string): string {
    return `${this.coreUrl}/api/v1/customers/${encodeURIComponent(customerId)}/entities/${encodeURIComponent(entityId)}/subscription`;
  }
}

function requireValue(value: string | undefined, field: string, operation: string): void {
  if (!value?.trim()) throw new Error(`${operation} requires ${field}`);
}

function validateIdempotencyKey(key: string, operation: string): void {
  if (!key?.trim() || new TextEncoder().encode(key).length > 255) {
    throw new Error(`${operation} requires an idempotencyKey up to 255 bytes`);
  }
}

function requestError(operation: string, response: Response): Error {
  return new Error(`${operation} failed: ${response.status} ${response.statusText}`);
}
