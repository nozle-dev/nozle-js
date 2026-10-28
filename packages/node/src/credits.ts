import { request, type RequestPolicy } from "./http";
import { apiError } from "./errors";
import { paginate } from "./paginate";
import type {
  CreditBalance,
  CreditBalances,
  EntityCreditBalance,
  EntityCreditBalances,
  EntityCreditOperationPage,
  EntityCreditTransferParams,
  EntityCreditTransferResult,
  IdempotentMutationOptions,
  CreditOperationPage,
  CreditOperationQuery,
} from "./types";

export class CreditsNamespace {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly policy: RequestPolicy,
  ) {}

  async getBalance(customerId: string, creditSystemCode: string): Promise<CreditBalance> {
    if (!customerId.trim()) throw new Error("credits.getBalance requires customerId");
    if (!creditSystemCode.trim()) {
      throw new Error("credits.getBalance requires creditSystemCode");
    }

    const response = await request(this.policy, 
      `${this.baseUrl}/api/v1/customers/${encodeURIComponent(customerId)}/credit-systems/${encodeURIComponent(creditSystemCode)}/balance`,
      {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      },
    );
    if (!response.ok) {
      throw await apiError(`credits.getBalance`, response);
    }
    return response.json() as Promise<CreditBalance>;
  }

  async listBalances(customerId: string): Promise<CreditBalances> {
    if (!customerId.trim()) throw new Error("credits.listBalances requires customerId");

    const response = await request(this.policy, 
      `${this.baseUrl}/api/v1/customers/${encodeURIComponent(customerId)}/credit-systems`,
      {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      },
    );
    if (!response.ok) {
      throw await apiError(`credits.listBalances`, response);
    }
    return response.json() as Promise<CreditBalances>;
  }

  async listOperations(
    customerId: string,
    query: CreditOperationQuery = {},
  ): Promise<CreditOperationPage> {
    if (!customerId.trim()) throw new Error("credits.listOperations requires customerId");
    if (query.limit !== undefined && (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 100)) {
      throw new Error("credits.listOperations limit must be an integer between 1 and 100");
    }

    const url = new URL(
      `${this.baseUrl}/api/v1/customers/${encodeURIComponent(customerId)}/credit-operations`,
    );
    if (query.creditSystemCode) url.searchParams.set("credit_system_code", query.creditSystemCode);
    if (query.limit !== undefined) url.searchParams.set("limit", String(query.limit));
    if (query.cursor) url.searchParams.set("cursor", query.cursor);

    const response = await request(this.policy, url, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!response.ok) {
      throw await apiError(`credits.listOperations`, response);
    }
    return response.json() as Promise<CreditOperationPage>;
  }

  async getEntityBalance(
    customerId: string,
    entityId: string,
    creditSystemCode: string,
  ): Promise<EntityCreditBalance> {
    validateEntityCreditPath(customerId, entityId, "credits.getEntityBalance");
    if (!creditSystemCode.trim()) {
      throw new Error("credits.getEntityBalance requires creditSystemCode");
    }
    const response = await request(this.policy, 
      `${this.entityCreditBaseUrl(customerId, entityId)}/${encodeURIComponent(creditSystemCode)}/balance`,
      {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      },
    );
    if (!response.ok) {
      throw await apiError(`credits.getEntityBalance`, response);
    }
    return response.json() as Promise<EntityCreditBalance>;
  }

  async listEntityBalances(
    customerId: string,
    entityId: string,
  ): Promise<EntityCreditBalances> {
    validateEntityCreditPath(customerId, entityId, "credits.listEntityBalances");
    const response = await request(this.policy, this.entityCreditBaseUrl(customerId, entityId), {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!response.ok) {
      throw await apiError(`credits.listEntityBalances`, response);
    }
    return response.json() as Promise<EntityCreditBalances>;
  }

  /** Every credit operation of the customer, page after page. `query.cursor` sets where to start. */
  iterateOperations(customerId: string, query: CreditOperationQuery = {}) {
    return paginate((cursor) => this.listOperations(customerId, { ...query, cursor }), (page) => page.operations, query.cursor);
  }

  /** Every credit operation of the Entity, page after page. */
  iterateEntityOperations(customerId: string, entityId: string, query: CreditOperationQuery = {}) {
    return paginate((cursor) => this.listEntityOperations(customerId, entityId, { ...query, cursor }), (page) => page.operations, query.cursor);
  }

  async listEntityOperations(
    customerId: string,
    entityId: string,
    query: CreditOperationQuery = {},
  ): Promise<EntityCreditOperationPage> {
    validateEntityCreditPath(customerId, entityId, "credits.listEntityOperations");
    validateOperationLimit(query.limit, "credits.listEntityOperations");
    const url = new URL(
      `${this.baseUrl}/api/v1/customers/${encodeURIComponent(customerId)}/entities/${encodeURIComponent(entityId)}/credit-operations`,
    );
    if (query.creditSystemCode) url.searchParams.set("credit_system_code", query.creditSystemCode);
    if (query.limit !== undefined) url.searchParams.set("limit", String(query.limit));
    if (query.cursor) url.searchParams.set("cursor", query.cursor);
    const response = await request(this.policy, url, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!response.ok) {
      throw await apiError(`credits.listEntityOperations`, response);
    }
    return response.json() as Promise<EntityCreditOperationPage>;
  }

  async allocate(
    customerId: string,
    entityId: string,
    params: EntityCreditTransferParams,
    options: IdempotentMutationOptions,
  ): Promise<EntityCreditTransferResult> {
    return this.transfer("allocate", customerId, entityId, params, options);
  }

  async deallocate(
    customerId: string,
    entityId: string,
    params: EntityCreditTransferParams,
    options: IdempotentMutationOptions,
  ): Promise<EntityCreditTransferResult> {
    return this.transfer("deallocate", customerId, entityId, params, options);
  }

  private async transfer(
    operation: "allocate" | "deallocate",
    customerId: string,
    entityId: string,
    params: EntityCreditTransferParams,
    options: IdempotentMutationOptions,
  ): Promise<EntityCreditTransferResult> {
    requireSecretKey(this.apiKey, `credits.${operation}`);
    validateEntityCreditPath(customerId, entityId, `credits.${operation}`);
    validateTransferParams(params, `credits.${operation}`);
    validateIdempotencyKey(options, `credits.${operation}`);
    const suffix = operation === "allocate" ? "credit-allocations" : "credit-deallocations";
    const response = await request(this.policy, 
      `${this.baseUrl}/api/v1/customers/${encodeURIComponent(customerId)}/entities/${encodeURIComponent(entityId)}/${suffix}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": options.idempotencyKey,
        },
        body: JSON.stringify({
          credit_system: params.creditSystemCode,
          amount: params.amount,
        }),
      },
    );
    if (!response.ok) {
      throw await apiError(`credits.${operation}`, response);
    }
    return response.json() as Promise<EntityCreditTransferResult>;
  }

  private entityCreditBaseUrl(customerId: string, entityId: string): string {
    return `${this.baseUrl}/api/v1/customers/${encodeURIComponent(customerId)}/entities/${encodeURIComponent(entityId)}/credit-systems`;
  }
}

function validateEntityCreditPath(customerId: string, entityId: string, operation: string): void {
  if (!customerId.trim()) throw new Error(`${operation} requires customerId`);
  if (!entityId.trim()) throw new Error(`${operation} requires entityId`);
}

function validateOperationLimit(limit: number | undefined, operation: string): void {
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
    throw new Error(`${operation} limit must be an integer between 1 and 100`);
  }
}

function validateTransferParams(params: EntityCreditTransferParams, operation: string): void {
  if (!params?.creditSystemCode?.trim()) {
    throw new Error(`${operation} requires creditSystemCode`);
  }
  if (
    typeof params.amount !== "string" ||
    !/^(?:0|[1-9]\d{0,17})(?:\.\d{1,12})?$/.test(params.amount) ||
    /^0(?:\.0+)?$/.test(params.amount)
  ) {
    throw new Error(`${operation} amount must be a positive decimal string with at most 12 decimals`);
  }
}

function validateIdempotencyKey(options: IdempotentMutationOptions, operation: string): void {
  const key = options?.idempotencyKey;
  if (!key?.trim()) throw new Error(`${operation} requires a non-empty idempotencyKey`);
  if (new TextEncoder().encode(key).length > 255) {
    throw new Error(`${operation} idempotencyKey must not exceed 255 bytes`);
  }
}

function requireSecretKey(apiKey: string, operation: string): void {
  if (apiKey.startsWith("pk_")) {
    throw new Error(`${operation} requires a secret key (sk_); publishable keys cannot transfer credits`);
  }
}
