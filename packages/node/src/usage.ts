import { request, type RequestPolicy } from "./http";
import { apiError } from "./errors";
import type {
  UsageCheckParams,
  UsageCheckResult,
  UsageTrackOptions,
  UsageTrackParams,
  UsageTrackResult,
} from "./types";

export class UsageNamespace {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly policy: RequestPolicy,
  ) {}

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

  async track(params: UsageTrackParams, options: UsageTrackOptions): Promise<UsageTrackResult> {
    requireSecretKey(this.apiKey, "usage.track");
    validateUsageParams(params);
    if (!options?.idempotencyKey?.trim()) {
      throw new Error("usage.track requires a non-empty idempotencyKey");
    }
    if (new TextEncoder().encode(options.idempotencyKey).length > 255) {
      throw new Error("usage.track idempotencyKey must not exceed 255 bytes");
    }

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
        timestamp: params.timestamp ?? new Date().toISOString(),
      }),
    });
    if (!response.ok) {
      throw await apiError(`usage.track`, response);
    }
    return response.json() as Promise<UsageTrackResult>;
  }
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
