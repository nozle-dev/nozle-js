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
        feature_code: params.featureCode,
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

  // Timestamps the SDK filled in, by idempotency key, so a retry of the same key sends the same request.
  // shortcut: lives in this client's memory, so a retry from another process must pass `timestamp`; keeps the last 1000 keys.
  private readonly generatedTimestamps = new Map<string, string>();

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
        feature_code: params.featureCode,
        ...(params.creditSystemCode && {
          credit_system_code: params.creditSystemCode,
        }),
        properties: params.properties ?? {},
        timestamp: params.timestamp ?? this.timestampFor(options.idempotencyKey),
      }),
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!response.ok) {
      throw new Error(`usage.track failed: ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<UsageTrackResult>;
  }

  private timestampFor(idempotencyKey: string): string {
    const known = this.generatedTimestamps.get(idempotencyKey);
    if (known) return known;
    const generated = new Date().toISOString();
    this.generatedTimestamps.set(idempotencyKey, generated);
    if (this.generatedTimestamps.size > 1000) {
      this.generatedTimestamps.delete(this.generatedTimestamps.keys().next().value as string);
    }
    return generated;
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
