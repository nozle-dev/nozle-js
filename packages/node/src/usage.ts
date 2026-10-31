import { request, type RequestPolicy } from "./http";
import { apiError } from "./errors";
import type {
  UsageCheckParams,
  UsageHold,
  UsageHoldCreateParams,
  UsageHoldCreateResult,
  UsageHoldFinalizeParams,
  UsageHoldFinalizeResult,
  UsageHoldList,
  UsageHoldListOptions,
  UsageHoldStatus,
  UsageCheckResult,
  UsageTrackOptions,
  UsageTrackParams,
  UsageTrackResult,
} from "./types";

export class UsageNamespace {
  /** Credit holds: reserve credits before a call whose final amount is known only afterwards (Engine 2.33.0+). */
  readonly holds: UsageHoldsNamespace;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly policy: RequestPolicy,
  ) {
    this.holds = new UsageHoldsNamespace(baseUrl, apiKey, policy);
  }

  async check(params: UsageCheckParams): Promise<UsageCheckResult> {
    validateUsageParams(params);
    const response = await request(this.policy, `${this.baseUrl}/api/v1/usage/check`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        customer_id: params.customerId,
        ...(params.entityId && { entity_id: params.entityId }),
        feature_code: params.featureCode,
        ...(params.creditSystemCode && {
          credit_system_code: params.creditSystemCode,
        }),
        properties: params.properties ?? {},
        occurred_at: params.occurredAt ?? new Date().toISOString(),
      }),
    }, { idempotent: true });
    if (!response.ok) {
      throw await apiError(`usage.check`, response);
    }
    return response.json() as Promise<UsageCheckResult>;
  }

  // Timestamps the SDK filled in, by idempotency key, so a retry of the same key sends the same request.
  // shortcut: lives in this client's memory, so a retry from another process must pass `timestamp`; keeps the last 1000 keys.
  private readonly generatedTimestamps = new Map<string, string>();

  async track(params: UsageTrackParams, options: UsageTrackOptions): Promise<UsageTrackResult> {
    requireSecretKey(this.apiKey, "usage.track");
    validateUsageParams(params);
    validateIdempotencyKey(options, "usage.track");

    const response = await request(this.policy, `${this.baseUrl}/api/v1/usage/track`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": options.idempotencyKey,
      },
      body: JSON.stringify({
        customer_id: params.customerId,
        ...(params.entityId && { entity_id: params.entityId }),
        feature_code: params.featureCode,
        ...(params.creditSystemCode && {
          credit_system_code: params.creditSystemCode,
        }),
        properties: params.properties ?? {},
        timestamp: params.timestamp ?? timestampFor(this.generatedTimestamps, options.idempotencyKey),
      }),
    });
    if (!response.ok) {
      throw await apiError(`usage.track`, response);
    }
    return response.json() as Promise<UsageTrackResult>;
  }
}

export class UsageHoldsNamespace {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly policy: RequestPolicy,
  ) {}

  // Same as usage.track: a retry of one create key or one hold's finalize sends the same timestamp, so Engine replays it.
  // shortcut: lives in this client's memory, so a retry from another process must pass `timestamp`; keeps the last 1000 keys.
  private readonly generatedTimestamps = new Map<string, string>();

  /** Reserves the credits `usage.track` would spend. A short balance answers `allowed: false`, not an error. */
  async create(params: UsageHoldCreateParams, options: UsageTrackOptions): Promise<UsageHoldCreateResult> {
    requireSecretKey(this.apiKey, "usage.holds.create");
    validateUsageParams(params);
    validateIdempotencyKey(options, "usage.holds.create");
    if (params.ttlSeconds !== undefined && (!Number.isInteger(params.ttlSeconds) || params.ttlSeconds < 1 || params.ttlSeconds > 86400)) {
      throw new Error("usage.holds.create ttlSeconds must be an integer between 1 and 86400");
    }

    const response = await request(this.policy, `${this.baseUrl}/api/v1/usage/holds`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": options.idempotencyKey,
      },
      body: JSON.stringify({
        customer_id: params.customerId,
        ...(params.entityId && { entity_id: params.entityId }),
        feature_code: params.featureCode,
        ...(params.creditSystemCode && {
          credit_system_code: params.creditSystemCode,
        }),
        properties: params.properties ?? {},
        timestamp: params.timestamp ?? timestampFor(this.generatedTimestamps, `create:${options.idempotencyKey}`),
        ...(params.ttlSeconds !== undefined && { ttl_seconds: params.ttlSeconds }),
      }),
    });
    if (!response.ok) {
      throw await apiError(`usage.holds.create`, response);
    }
    return response.json() as Promise<UsageHoldCreateResult>;
  }

  /**
   * Spends the actual usage, priced at the rate pinned by the hold, and releases what is left. Engine replays a
   * repeated finalize with the same usage, so it is retried like an idempotent call.
   */
  async finalize(holdId: string, params: UsageHoldFinalizeParams = {}): Promise<UsageHoldFinalizeResult> {
    requireSecretKey(this.apiKey, "usage.holds.finalize");
    requireHoldId(holdId, "usage.holds.finalize");
    const response = await request(this.policy, `${this.holdUrl(holdId)}/finalize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        properties: params.properties ?? {},
        timestamp: params.timestamp ?? timestampFor(this.generatedTimestamps, `finalize:${holdId}`),
      }),
    }, { idempotent: true });
    if (!response.ok) {
      throw await apiError(`usage.holds.finalize`, response);
    }
    return response.json() as Promise<UsageHoldFinalizeResult>;
  }

  /** Returns the held credits. Idempotent; a finalized hold throws `hold_already_resolved` (409). */
  async release(holdId: string): Promise<UsageHold> {
    requireSecretKey(this.apiKey, "usage.holds.release");
    requireHoldId(holdId, "usage.holds.release");
    const response = await request(this.policy, `${this.holdUrl(holdId)}/release`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}` },
    }, { idempotent: true });
    if (!response.ok) {
      throw await apiError(`usage.holds.release`, response);
    }
    return response.json() as Promise<UsageHold>;
  }

  async get(holdId: string): Promise<UsageHold> {
    requireHoldId(holdId, "usage.holds.get");
    const response = await request(this.policy, this.holdUrl(holdId), {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!response.ok) {
      throw await apiError(`usage.holds.get`, response);
    }
    return response.json() as Promise<UsageHold>;
  }

  /** The customer's newest holds (at most 100), optionally of one status. */
  async list(customerId: string, options: UsageHoldListOptions = {}): Promise<UsageHoldList> {
    if (!customerId?.trim()) throw new Error("usage.holds.list requires customerId");
    if (options.status !== undefined && !HOLD_STATUSES.includes(options.status)) {
      throw new Error(`usage.holds.list status must be one of ${HOLD_STATUSES.join(", ")}`);
    }
    const url = new URL(`${this.baseUrl}/api/v1/customers/${encodeURIComponent(customerId)}/credit-holds`);
    if (options.status) url.searchParams.set("status", options.status);
    const response = await request(this.policy, url, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!response.ok) {
      throw await apiError(`usage.holds.list`, response);
    }
    return response.json() as Promise<UsageHoldList>;
  }

  private holdUrl(holdId: string): string {
    return `${this.baseUrl}/api/v1/usage/holds/${encodeURIComponent(holdId)}`;
  }
}

const HOLD_STATUSES: readonly UsageHoldStatus[] = ["held", "denied", "finalized", "released", "expired"];

function timestampFor(generated: Map<string, string>, key: string): string {
  const known = generated.get(key);
  if (known) return known;
  const now = new Date().toISOString();
  generated.set(key, now);
  if (generated.size > 1000) {
    generated.delete(generated.keys().next().value as string);
  }
  return now;
}

function validateIdempotencyKey(options: UsageTrackOptions, operation: string): void {
  if (!options?.idempotencyKey?.trim()) {
    throw new Error(`${operation} requires a non-empty idempotencyKey`);
  }
  if (new TextEncoder().encode(options.idempotencyKey).length > 255) {
    throw new Error(`${operation} idempotencyKey must not exceed 255 bytes`);
  }
}

function requireHoldId(holdId: string, operation: string): void {
  if (!holdId?.trim()) throw new Error(`${operation} requires holdId`);
}

function validateUsageParams(params: UsageCheckParams | UsageTrackParams): void {
  if (!params.customerId?.trim()) throw new Error("usage requires customerId");
  if (params.entityId !== undefined && !params.entityId.trim()) {
    throw new Error("usage entityId must not be empty");
  }
  if (!params.featureCode?.trim()) {
    throw new Error("usage requires featureCode");
  }
}

function requireSecretKey(apiKey: string, operation: string): void {
  if (apiKey.startsWith("pk_")) {
    throw new Error(`${operation} requires a secret key (sk_); publishable keys cannot mutate usage`);
  }
}
