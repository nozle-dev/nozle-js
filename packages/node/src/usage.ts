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
    private readonly timeout: number,
  ) {}

  async check(params: UsageCheckParams): Promise<UsageCheckResult> {
    validateUsageParams(params);
    const response = await fetch(`${this.baseUrl}/api/v1/usage/check`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        customer_id: params.customerId,
        ...(params.entityId && { entity_id: params.entityId }),
        billable_metric_code: params.billableMetricCode,
        ...(params.creditSystemCode && {
          credit_system_code: params.creditSystemCode,
        }),
        properties: params.properties ?? {},
        occurred_at: params.occurredAt ?? new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!response.ok) {
      throw new Error(`usage.check failed: ${response.status} ${response.statusText}`);
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

    const response = await fetch(`${this.baseUrl}/api/v1/usage/track`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": options.idempotencyKey,
      },
      body: JSON.stringify({
        customer_id: params.customerId,
        ...(params.entityId && { entity_id: params.entityId }),
        billable_metric_code: params.billableMetricCode,
        ...(params.creditSystemCode && {
          credit_system_code: params.creditSystemCode,
        }),
        properties: params.properties ?? {},
        timestamp: params.timestamp ?? new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!response.ok) {
      throw new Error(`usage.track failed: ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<UsageTrackResult>;
  }
}

function validateUsageParams(params: UsageCheckParams | UsageTrackParams): void {
  if (!params.customerId?.trim()) throw new Error("usage requires customerId");
  if (params.entityId !== undefined && !params.entityId.trim()) {
    throw new Error("usage entityId must not be empty");
  }
  if (!params.billableMetricCode?.trim()) {
    throw new Error("usage requires billableMetricCode");
  }
}

function requireSecretKey(apiKey: string, operation: string): void {
  if (apiKey.startsWith("pk_")) {
    throw new Error(`${operation} requires a secret key (sk_); publishable keys cannot mutate usage`);
  }
}
