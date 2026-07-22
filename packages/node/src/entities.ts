import type {
  CustomerEntity,
  CustomerEntityBulkMutationResult,
  CustomerEntityBulkUpsertItem,
  CustomerEntityListQuery,
  CustomerEntityMutationResult,
  CustomerEntityPage,
  CustomerEntityUpsertData,
  IdempotentMutationOptions,
} from "./types";

export class EntitiesNamespace {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly timeout: number,
  ) {}

  async get(customerId: string, entityId: string): Promise<CustomerEntity> {
    validateEntityPath(customerId, entityId, "entities.get");
    const response = await fetch(this.entityUrl(customerId, entityId), {
      headers: { Authorization: `Bearer ${this.apiKey}` },
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!response.ok) {
      throw new Error(`entities.get failed: ${response.status} ${response.statusText}`);
    }
    const payload = (await response.json()) as { entity: CustomerEntity };
    return payload.entity;
  }

  async list(
    customerId: string,
    query: CustomerEntityListQuery = {},
  ): Promise<CustomerEntityPage> {
    if (!customerId.trim()) throw new Error("entities.list requires customerId");
    validatePageLimit(query.limit, "entities.list");
    if (query.status && !["active", "suspended", "deleted"].includes(query.status)) {
      throw new Error("entities.list status must be active, suspended, or deleted");
    }

    const url = new URL(
      `${this.baseUrl}/api/v1/customers/${encodeURIComponent(customerId)}/entities`,
    );
    if (query.status) url.searchParams.set("status", query.status);
    if (query.limit !== undefined) url.searchParams.set("limit", String(query.limit));
    if (query.cursor) url.searchParams.set("cursor", query.cursor);

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!response.ok) {
      throw new Error(`entities.list failed: ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<CustomerEntityPage>;
  }

  async upsert(
    customerId: string,
    entityId: string,
    data: CustomerEntityUpsertData,
    options: IdempotentMutationOptions,
  ): Promise<CustomerEntityMutationResult> {
    requireSecretKey(this.apiKey, "entities.upsert");
    validateEntityPath(customerId, entityId, "entities.upsert");
    validateMutationOptions(options, "entities.upsert");
    validateEntityData(data, "entities.upsert");

    const response = await fetch(this.entityUrl(customerId, entityId), {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": options.idempotencyKey,
      },
      body: JSON.stringify({
        name: data.name ?? null,
        status: data.status,
        metadata: data.metadata ?? {},
      }),
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!response.ok) {
      throw new Error(`entities.upsert failed: ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<CustomerEntityMutationResult>;
  }

  async suspend(
    customerId: string,
    entityId: string,
    options: IdempotentMutationOptions,
  ): Promise<CustomerEntityMutationResult> {
    requireSecretKey(this.apiKey, "entities.suspend");
    validateEntityPath(customerId, entityId, "entities.suspend");
    validateMutationOptions(options, "entities.suspend");
    const current = await this.get(customerId, entityId);
    return this.upsert(
      customerId,
      entityId,
      {
        name: current.name,
        status: "suspended",
        metadata: current.metadata,
      },
      options,
    );
  }

  async activate(
    customerId: string,
    entityId: string,
    options: IdempotentMutationOptions,
  ): Promise<CustomerEntityMutationResult> {
    requireSecretKey(this.apiKey, "entities.activate");
    validateEntityPath(customerId, entityId, "entities.activate");
    validateMutationOptions(options, "entities.activate");
    const current = await this.get(customerId, entityId);
    return this.upsert(
      customerId,
      entityId,
      {
        name: current.name,
        status: "active",
        metadata: current.metadata,
      },
      options,
    );
  }

  async bulkUpsert(
    customerId: string,
    entities: CustomerEntityBulkUpsertItem[],
    options: IdempotentMutationOptions,
  ): Promise<CustomerEntityBulkMutationResult> {
    requireSecretKey(this.apiKey, "entities.bulkUpsert");
    if (!customerId.trim()) throw new Error("entities.bulkUpsert requires customerId");
    validateMutationOptions(options, "entities.bulkUpsert");
    if (entities.length < 1 || entities.length > 500) {
      throw new Error("entities.bulkUpsert requires between 1 and 500 entities");
    }
    const externalIds = new Set<string>();
    const body = entities.map((entity) => {
      const externalId = entity.externalId?.trim();
      if (!externalId) {
        throw new Error("entities.bulkUpsert requires every externalId");
      }
      validateEntityId(externalId, "entities.bulkUpsert");
      if (externalIds.has(externalId)) {
        throw new Error(`entities.bulkUpsert contains duplicate externalId ${externalId}`);
      }
      externalIds.add(externalId);
      validateEntityData(entity, "entities.bulkUpsert");
      return {
        external_id: externalId,
        name: entity.name ?? null,
        status: entity.status,
        metadata: entity.metadata ?? {},
      };
    });

    const response = await fetch(
      `${this.baseUrl}/api/v1/customers/${encodeURIComponent(customerId)}/entities/bulk-upsert`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": options.idempotencyKey,
        },
        body: JSON.stringify({ entities: body }),
        signal: AbortSignal.timeout(this.timeout),
      },
    );
    if (!response.ok) {
      throw new Error(`entities.bulkUpsert failed: ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<CustomerEntityBulkMutationResult>;
  }

  private entityUrl(customerId: string, entityId: string): string {
    return `${this.baseUrl}/api/v1/customers/${encodeURIComponent(customerId)}/entities/${encodeURIComponent(entityId)}`;
  }
}

function validateEntityPath(customerId: string, entityId: string, operation: string): void {
  if (!customerId.trim()) throw new Error(`${operation} requires customerId`);
  validateEntityId(entityId, operation);
}

function validateEntityId(entityId: string, operation: string): void {
  if (!entityId.trim()) throw new Error(`${operation} requires entityId`);
  if (new TextEncoder().encode(entityId.trim()).length > 255) {
    throw new Error(`${operation} entityId must not exceed 255 bytes`);
  }
}

function validateEntityData(data: CustomerEntityUpsertData, operation: string): void {
  if (!data || !["active", "suspended", "deleted"].includes(data.status)) {
    throw new Error(`${operation} requires status active, suspended, or deleted`);
  }
}

function validatePageLimit(limit: number | undefined, operation: string): void {
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
    throw new Error(`${operation} limit must be an integer between 1 and 100`);
  }
}

function validateMutationOptions(options: IdempotentMutationOptions, operation: string): void {
  const key = options?.idempotencyKey;
  if (!key?.trim()) throw new Error(`${operation} requires a non-empty idempotencyKey`);
  if (new TextEncoder().encode(key).length > 255) {
    throw new Error(`${operation} idempotencyKey must not exceed 255 bytes`);
  }
}

function requireSecretKey(apiKey: string, operation: string): void {
  if (apiKey.startsWith("pk_")) {
    throw new Error(`${operation} requires a secret key (sk_); publishable keys cannot mutate Entities`);
  }
}
