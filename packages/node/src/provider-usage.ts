import type { Nozle } from "./client";

export type ProviderTokenType = "input" | "cached_input" | "cache_write" | "output" | "reasoning";

export interface ProviderTokenUsage {
  featureInputTokens: number;
  featureOutputTokens: number;
  categories: Array<{ type: ProviderTokenType; tokens: number }>;
}

interface CaptureProviderUsageParams {
  nozle: Nozle;
  customerId: string;
  featureCode: string;
  feature?: string;
  costMeterCode?: string;
  provider: "openai" | "anthropic";
  model: unknown;
  requestId?: unknown;
  usage: ProviderTokenUsage;
  latencyMs: number;
}

export function normalizeOpenAIUsage(usage: any): ProviderTokenUsage {
  const totalInput = tokenCount(usage?.prompt_tokens ?? usage?.input_tokens);
  const cachedInput = Math.min(
    totalInput,
    tokenCount(usage?.prompt_tokens_details?.cached_tokens ?? usage?.input_tokens_details?.cached_tokens),
  );
  const totalOutput = tokenCount(usage?.completion_tokens ?? usage?.output_tokens);
  const reasoning = Math.min(
    totalOutput,
    tokenCount(
      usage?.completion_tokens_details?.reasoning_tokens ??
        usage?.output_tokens_details?.reasoning_tokens,
    ),
  );

  return {
    featureInputTokens: totalInput,
    featureOutputTokens: totalOutput,
    categories: compactCategories([
      { type: "input", tokens: totalInput - cachedInput },
      { type: "cached_input", tokens: cachedInput },
      { type: "output", tokens: totalOutput - reasoning },
      { type: "reasoning", tokens: reasoning },
    ]),
  };
}

export function normalizeAnthropicUsage(usage: any): ProviderTokenUsage {
  const input = tokenCount(usage?.input_tokens);
  const cachedInput = tokenCount(usage?.cache_read_input_tokens);
  const cacheWrite = tokenCount(usage?.cache_creation_input_tokens);
  const output = tokenCount(usage?.output_tokens);

  return {
    featureInputTokens: input + cachedInput + cacheWrite,
    featureOutputTokens: output,
    categories: compactCategories([
      { type: "input", tokens: input },
      { type: "cached_input", tokens: cachedInput },
      { type: "cache_write", tokens: cacheWrite },
      { type: "output", tokens: output },
    ]),
  };
}

export function captureProviderUsage(params: CaptureProviderUsageParams): void {
  const transactionId = params.nozle.events.createTransactionId();
  const occurredAt = new Date();
  const model = stringValue(params.model);
  const requestId = stringValue(params.requestId) || undefined;
  const featureEvent = params.nozle.track(
    params.customerId,
    params.featureCode,
    {
      provider: params.provider,
      model,
      input_tokens: params.usage.featureInputTokens,
      output_tokens: params.usage.featureOutputTokens,
      latency_ms: params.latencyMs,
      ...(params.feature && { feature: params.feature }),
    },
    { transactionId, timestamp: occurredAt.toISOString() },
  );

  const detailedCostEvents = params.costMeterCode
    ? params.usage.categories.map((category) =>
        params.nozle.costEvents.track({
          costMeterCode: params.costMeterCode as string,
          parentTransactionId: transactionId,
          requestId,
          operationKey: category.type,
          properties: {
            tokens: category.tokens,
            provider: params.provider,
            model,
            type: category.type,
          },
          timestamp: Math.floor(occurredAt.getTime() / 1000),
        }),
      )
    : [];

  // Provider responses must never fail because telemetry delivery failed. Both
  // endpoints are durably acknowledged and support out-of-order parent linking.
  void Promise.allSettled([featureEvent, ...detailedCostEvents]);
}

function tokenCount(value: unknown): number {
  const count = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(count) || count <= 0) return 0;
  return Math.floor(count);
}

function compactCategories(
  categories: Array<{ type: ProviderTokenType; tokens: number }>,
): Array<{ type: ProviderTokenType; tokens: number }> {
  return categories.filter(({ tokens }) => tokens > 0);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
