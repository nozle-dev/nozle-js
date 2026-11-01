import type { Nozle } from "./client";
import { holdUntilFlushed, type EventBuffer } from "./event-buffer";

export type ProviderTokenType = "input" | "cached_input" | "cache_write" | "output" | "reasoning";

export interface ProviderTokenUsage {
  featureInputTokens: number;
  featureOutputTokens: number;
  categories: Array<{ type: ProviderTokenType; tokens: number }>;
}

/** The usage format a response was recognised by: OpenAI-compatible, Anthropic, or Gemini. */
export type ProviderUsageFormat = "openai" | "anthropic" | "gemini";

interface CaptureProviderUsageParams {
  nozle: Nozle;
  customerId: string;
  featureCode: string;
  feature?: string;
  costMeterCode?: string;
  provider: string;
  /** Host the provider request went to, for example `openrouter.ai`. */
  providerHost?: string;
  model: unknown;
  requestId?: unknown;
  usage: ProviderTokenUsage;
  latencyMs: number;
  /** Receives delivery failures and a missing Feature for `featureCode`. Without it they are emitted as a `NozleTrackingWarning` process warning. */
  onError?: (error: unknown) => void;
  /** Queues the usage event here instead of sending it; the buffer's `flush()` and `close()` also wait for the cost events. */
  buffer?: EventBuffer;
}

/** Token usage found in one provider response, with the response's own id and model. */
export interface DetectedUsage {
  format: ProviderUsageFormat;
  usage: ProviderTokenUsage;
  id?: string;
  model?: string;
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

export function normalizeGeminiUsage(usage: any): ProviderTokenUsage {
  const prompt = tokenCount(usage?.promptTokenCount);
  const cachedInput = Math.min(prompt, tokenCount(usage?.cachedContentTokenCount));
  const output = tokenCount(usage?.candidatesTokenCount);
  const reasoning = tokenCount(usage?.thoughtsTokenCount);

  return {
    featureInputTokens: prompt,
    featureOutputTokens: output + reasoning,
    categories: compactCategories([
      { type: "input", tokens: prompt - cachedInput },
      { type: "cached_input", tokens: cachedInput },
      { type: "output", tokens: output },
      { type: "reasoning", tokens: reasoning },
    ]),
  };
}

/**
 * Recognises token usage by the shape of a provider response, not by provider name: an
 * OpenAI-style `usage` (`prompt_tokens`, or `input_tokens` from the Responses API), an
 * Anthropic `usage` (a `message` object or cache token fields), or Gemini `usageMetadata`.
 * Returns undefined when the body carries no usage.
 */
export function detectUsage(body: any): DetectedUsage | undefined {
  if (!body || typeof body !== "object") return undefined;
  const id = stringValue(body.id ?? body.responseId) || undefined;
  const model = stringValue(body.model ?? body.modelVersion) || undefined;
  if (body.usageMetadata && typeof body.usageMetadata === "object") {
    return { format: "gemini", usage: normalizeGeminiUsage(body.usageMetadata), id, model };
  }
  const usage = body.usage;
  if (!usage || typeof usage !== "object") return undefined;
  const anthropic =
    body.type === "message" || "cache_read_input_tokens" in usage || "cache_creation_input_tokens" in usage;
  if (anthropic) return { format: "anthropic", usage: normalizeAnthropicUsage(usage), id, model };
  const known = ["prompt_tokens", "completion_tokens", "input_tokens", "output_tokens"].some((key) => key in usage);
  return known ? { format: "openai", usage: normalizeOpenAIUsage(usage), id, model } : undefined;
}

/**
 * Folds the events of a server-sent stream into the final usage. OpenAI sends usage in the last
 * chunk, the Responses API in `response.completed`, Anthropic in `message_start` and then a
 * cumulative `message_delta`, and Gemini in every chunk with the totals last.
 */
export class StreamUsageCollector {
  private body: any = {};

  add(event: any): void {
    if (!event || typeof event !== "object") return;
    const source = event.response ?? event.message ?? event;
    for (const key of ["id", "responseId", "model", "modelVersion"] as const) {
      if (source[key] !== undefined && source[key] !== null) this.body[key] = source[key];
    }
    if (event.message) this.body.type = "message";
    const usage = source.usage ?? event.usage;
    if (usage && typeof usage === "object") this.body.usage = { ...this.body.usage, ...withoutNull(usage) };
    if (source.usageMetadata) this.body.usageMetadata = source.usageMetadata;
  }

  result(): DetectedUsage | undefined {
    return detectUsage(this.body);
  }
}

function withoutNull(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null && item !== undefined));
}

export function captureProviderUsage(params: CaptureProviderUsageParams): Promise<PromiseSettledResult<unknown>[]> {
  const requestId = stringValue(params.requestId) || undefined;
  // The provider's response id makes the event id stable, so a repeated delivery is not billed twice.
  const transactionId = requestId ? `llm-${params.provider}-${requestId}` : params.nozle.events.createTransactionId();
  const occurredAt = new Date();
  const model = stringValue(params.model);
  const properties = {
    ...(params.provider && { provider: params.provider }),
    model,
    input_tokens: params.usage.featureInputTokens,
    output_tokens: params.usage.featureOutputTokens,
    latency_ms: params.latencyMs,
    ...(params.providerHost && { provider_host: params.providerHost }),
    ...(params.feature && { feature: params.feature }),
  };
  const timestamp = occurredAt.toISOString();
  const buffer = params.buffer;
  // A buffered event's delivery failures go to the buffer's onError; only an invalid event rejects here.
  const featureEvent = buffer
    ? new Promise<string>((resolve) =>
        resolve(buffer.track({ customerId: params.customerId, event: params.featureCode, metadata: properties, transactionId, timestamp })),
      )
    : params.nozle.track(params.customerId, params.featureCode, properties, { transactionId, timestamp });

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
  const settled = Promise.allSettled([featureEvent, ...detailedCostEvents]);
  if (buffer) holdUntilFlushed(buffer, settled);
  const report = params.onError ?? warnTrackingFailure;
  void settled.then((results) => {
    for (const result of results) if (result.status === "rejected") safely(report, result.reason);
  });
  // The Feature probe is an extra request, so it stays opt-in with onError.
  if (params.onError) void checkFeatureOnce(params.nozle, params.featureCode, report);
  return settled;
}

const checkedFeatures = new WeakMap<object, Set<string>>();

/**
 * Reports once per client and event code when no Feature has that code: the usage is then stored
 * but never billed. Reads Core's GET /features/{code}; any other answer, including a key without
 * read permission, stays silent.
 */
async function checkFeatureOnce(nozle: Nozle, featureCode: string, report: (error: unknown) => void): Promise<void> {
  if (!nozle.eventsUrl || !nozle.apiKey) return;
  let seen = checkedFeatures.get(nozle);
  if (!seen) checkedFeatures.set(nozle, (seen = new Set()));
  if (seen.has(featureCode)) return;
  seen.add(featureCode);
  try {
    const response = await fetch(`${nozle.eventsUrl}/api/v1/features/${encodeURIComponent(featureCode)}`, {
      headers: { Authorization: `Bearer ${nozle.apiKey}` },
    });
    if (response.status === 404) {
      const error = new Error(
        `No Feature has the code "${featureCode}", so this usage is stored but not billed. ` +
          "Create a metered Feature with that code: https://docs.nozle.dev/guides/ai/token-billing",
      );
      safely(report, Object.assign(error, { name: "NozleSetupError", code: "feature_not_found" }));
    }
  } catch {
    // A failed check never affects recording.
  }
}

/** Default for `onError`: a Node warning. Never throws; does nothing where `process.emitWarning` does not exist (edge, browser). */
export function warnTrackingFailure(error: unknown): void {
  try {
    const detail = error instanceof Error ? error.message : String(error);
    const code = (error as { code?: unknown } | null)?.code;
    const message = `Nozle tracking failed after a successful LLM response: ${detail}`;
    process.emitWarning(message, { type: "NozleTrackingWarning", ...(typeof code === "string" ? { code } : {}) });
  } catch {
    // No process, or a warning handler that throws: the provider response is unaffected.
  }
}

function safely(report: (error: unknown) => void, error: unknown): void {
  try {
    report(error);
  } catch {
    // The provider response must not depend on the error callback.
  }
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

/** Token usage your code read from a provider response, for clients `captureFetch` cannot wrap. */
export interface RecordUsageParams {
  customerId: string;
  /** Feature code of the usage event. Default `llm_tokens`. */
  featureCode?: string;
  model: string;
  /** All input tokens, including cached input and cache writes. */
  inputTokens: number;
  /** All output tokens, including reasoning tokens. */
  outputTokens: number;
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
  /** Stored as the `provider` property, for example `openai`. */
  provider?: string;
  /** The provider's response id. Recording the same id twice records one event. */
  requestId?: string;
  latencyMs?: number;
  feature?: string;
  costMeterCode?: string;
}

/** Records one LLM call's usage. Rejects with the first delivery error. */
export async function recordUsage(nozle: Nozle, params: RecordUsageParams): Promise<void> {
  if (!params.customerId?.trim()) throw new Error("recordUsage requires customerId");
  const input = tokenCount(params.inputTokens);
  const output = tokenCount(params.outputTokens);
  const cached = Math.min(input, tokenCount(params.cachedInputTokens));
  const cacheWrite = Math.min(input - cached, tokenCount(params.cacheWriteTokens));
  const reasoning = Math.min(output, tokenCount(params.reasoningTokens));
  const results = await captureProviderUsage({
    nozle,
    customerId: params.customerId,
    featureCode: params.featureCode ?? "llm_tokens",
    feature: params.feature,
    costMeterCode: params.costMeterCode,
    provider: params.provider ?? "",
    model: params.model,
    requestId: params.requestId,
    latencyMs: tokenCount(params.latencyMs),
    usage: {
      featureInputTokens: input,
      featureOutputTokens: output,
      categories: compactCategories([
        { type: "input", tokens: input - cached - cacheWrite },
        { type: "cached_input", tokens: cached },
        { type: "cache_write", tokens: cacheWrite },
        { type: "output", tokens: output - reasoning },
        { type: "reasoning", tokens: reasoning },
      ]),
    },
  });
  const failed = results.find((result) => result.status === "rejected");
  if (failed) throw (failed as PromiseRejectedResult).reason;
}
