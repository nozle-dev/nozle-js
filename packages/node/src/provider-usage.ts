import type { Nozle } from "./client";
import { holdUntilFlushed, type EventBuffer } from "./event-buffer";

export type ProviderTokenType =
  | "input"
  | "cached_input"
  | "cache_write"
  | "cache_write_1h"
  | "output"
  | "reasoning"
  | "audio_input"
  | "audio_output"
  | "image_input"
  | "image_output"
  | "batch_input"
  | "batch_output";

/** One call's usage. `categories` are the disjoint token buckets: every token sits in exactly one. */
export interface ProviderTokenUsage {
  featureInputTokens: number;
  featureOutputTokens: number;
  categories: Array<{ type: ProviderTokenType; tokens: number }>;
  /** `batch` when the whole call was billed at the provider's batch tier. */
  serviceTier?: "batch";
  /** `estimated` when Nozle counted the tokens itself (an aborted stream). Default `reported`. */
  usageSource?: "reported" | "estimated";
  /** The stream ended before the provider sent its final usage. */
  streamAborted?: boolean;
}

/** Bytes per token for the estimate of an aborted stream. The same constant and rule in every Nozle SDK and the Engine. */
export const ESTIMATE_BYTES_PER_TOKEN = 4;

/** `ceil(bytes / 4)`. */
export function estimateTokens(bytes: number): number {
  return Math.ceil(bytes / ESTIMATE_BYTES_PER_TOKEN);
}

const BREAKDOWN_PROPERTY: Partial<Record<ProviderTokenType, string>> = {
  cached_input: "cached_input_tokens",
  cache_write: "cache_write_tokens",
  cache_write_1h: "cache_write_1h_tokens",
  reasoning: "reasoning_tokens",
  audio_input: "audio_input_tokens",
  audio_output: "audio_output_tokens",
  image_input: "image_input_tokens",
  image_output: "image_output_tokens",
};

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
  const inDetails = usage?.prompt_tokens_details ?? usage?.input_tokens_details;
  const input = take(totalInput, inDetails?.cached_tokens, inDetails?.cache_write_tokens, inDetails?.audio_tokens);
  const totalOutput = tokenCount(usage?.completion_tokens ?? usage?.output_tokens);
  const outDetails = usage?.completion_tokens_details ?? usage?.output_tokens_details;
  const output = take(totalOutput, outDetails?.reasoning_tokens, outDetails?.audio_tokens);

  return {
    featureInputTokens: totalInput,
    featureOutputTokens: totalOutput,
    categories: compactCategories([
      { type: "input", tokens: input.rest },
      { type: "cached_input", tokens: input.parts[0] },
      { type: "cache_write", tokens: input.parts[1] },
      { type: "audio_input", tokens: input.parts[2] },
      { type: "output", tokens: output.rest },
      { type: "reasoning", tokens: output.parts[0] },
      { type: "audio_output", tokens: output.parts[1] },
    ]),
  };
}

export function normalizeAnthropicUsage(usage: any): ProviderTokenUsage {
  const input = tokenCount(usage?.input_tokens);
  const cachedInput = tokenCount(usage?.cache_read_input_tokens);
  const created = usage?.cache_creation;
  const written1h = tokenCount(created?.ephemeral_1h_input_tokens);
  const written5m = tokenCount(created?.ephemeral_5m_input_tokens);
  // The flat total wins when both are present; the 1h part never exceeds it.
  const cacheWrite = usage?.cache_creation_input_tokens !== undefined ? tokenCount(usage.cache_creation_input_tokens) : written1h + written5m;
  const cacheWrite1h = Math.min(cacheWrite, written1h);
  const output = tokenCount(usage?.output_tokens);

  return {
    featureInputTokens: input + cachedInput + cacheWrite,
    featureOutputTokens: output,
    categories: compactCategories([
      { type: "input", tokens: input },
      { type: "cached_input", tokens: cachedInput },
      { type: "cache_write", tokens: cacheWrite - cacheWrite1h },
      { type: "cache_write_1h", tokens: cacheWrite1h },
      { type: "output", tokens: output },
    ]),
  };
}

export function normalizeGeminiUsage(usage: any): ProviderTokenUsage {
  const prompt = tokenCount(usage?.promptTokenCount);
  const candidates = tokenCount(usage?.candidatesTokenCount);
  const reasoning = tokenCount(usage?.thoughtsTokenCount);
  const input = take(
    prompt,
    usage?.cachedContentTokenCount,
    modalityTokens(usage?.promptTokensDetails, "AUDIO"),
    modalityTokens(usage?.promptTokensDetails, "IMAGE"),
  );
  const output = take(
    candidates,
    modalityTokens(usage?.candidatesTokensDetails, "AUDIO"),
    modalityTokens(usage?.candidatesTokensDetails, "IMAGE"),
  );

  return {
    featureInputTokens: prompt,
    featureOutputTokens: candidates + reasoning,
    categories: compactCategories([
      { type: "input", tokens: input.rest },
      { type: "cached_input", tokens: input.parts[0] },
      { type: "audio_input", tokens: input.parts[1] },
      { type: "image_input", tokens: input.parts[2] },
      { type: "output", tokens: output.rest },
      { type: "reasoning", tokens: reasoning },
      { type: "audio_output", tokens: output.parts[0] },
      { type: "image_output", tokens: output.parts[1] },
    ]),
  };
}

/** Sums the entries of a Gemini `*TokensDetails` array that have this modality. */
function modalityTokens(details: unknown, modality: string): number {
  if (!Array.isArray(details)) return 0;
  return details.reduce((sum, item) => sum + (item?.modality === modality ? tokenCount(item?.tokenCount) : 0), 0);
}

/** Takes each wanted part in order out of `total`, so no token lands in two buckets. `rest` is what no part took. */
function take(total: number, ...wanted: unknown[]): { parts: number[]; rest: number } {
  let rest = total;
  const parts = wanted.map((value) => {
    const part = Math.min(rest, tokenCount(value));
    rest -= part;
    return part;
  });
  return { parts, rest };
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
  const tier = usage.service_tier === "batch" || body.service_tier === "batch" ? ({ serviceTier: "batch" } as const) : {};
  if (anthropic) return { format: "anthropic", usage: { ...normalizeAnthropicUsage(usage), ...tier }, id, model };
  const known = ["prompt_tokens", "completion_tokens", "input_tokens", "output_tokens"].some((key) => key in usage);
  return known ? { format: "openai", usage: { ...normalizeOpenAIUsage(usage), ...tier }, id, model } : undefined;
}

/**
 * Folds the events of a server-sent stream into the final usage. OpenAI sends usage in the last
 * chunk, the Responses API in `response.completed`, Anthropic in `message_start` and then a
 * cumulative `message_delta`, and Gemini in every chunk with the totals last.
 * It also counts the delivered delta text, for the estimate of a stream that ended early.
 */
export class StreamUsageCollector {
  private body: any = {};
  private deltaBytes = 0;
  private finished = false;

  add(event: any): void {
    if (!event || typeof event !== "object") return;
    const source = event.response ?? event.message ?? event;
    for (const key of ["id", "responseId", "model", "modelVersion", "service_tier"] as const) {
      if (source[key] !== undefined && source[key] !== null) this.body[key] = source[key];
    }
    if (event.message) this.body.type = "message";
    const usage = source.usage ?? event.usage;
    if (usage && typeof usage === "object") this.body.usage = { ...this.body.usage, ...withoutNull(usage) };
    if (source.usageMetadata) this.body.usageMetadata = source.usageMetadata;
    this.deltaBytes += deltaTextBytes(event);
    // The provider's final usage marker: the OpenAI usage chunk, response.completed, message_stop, Gemini's finishReason chunk.
    if (
      event.type === "message_stop" ||
      event.type === "response.completed" ||
      event.type === "response.incomplete" ||
      (event.usage && Array.isArray(event.choices) && event.choices.length === 0) ||
      (Array.isArray(event.candidates) && event.candidates.some((c: any) => c?.finishReason))
    ) {
      this.finished = true;
    }
  }

  /** Call when the stream's own end marker (`[DONE]`) arrives. */
  markFinished(): void {
    this.finished = true;
  }

  get complete(): boolean {
    return this.finished;
  }

  /** UTF-8 bytes of the delta text delivered so far. */
  get deliveredBytes(): number {
    return this.deltaBytes;
  }

  /**
   * The usage of the stream. `ended` is false when the consumer stopped early or the connection
   * dropped; the usage is then the provider's partial report, or an estimate when it sent none.
   * `inputBytes` is the UTF-8 size of the request's message text, for the input estimate.
   */
  result(ended = true, inputBytes = 0): DetectedUsage | undefined {
    const found = detectUsage(this.body);
    if (ended || this.finished) {
      return found && { ...found, usage: { ...found.usage, usageSource: "reported" } };
    }
    const estimatedOutput = estimateTokens(this.deltaBytes);
    if (found) {
      const reported = found.usage.featureOutputTokens;
      // Anthropic's message_start carries a placeholder output count; delivered text can be longer.
      if (found.format !== "anthropic" || estimatedOutput <= reported) {
        return { ...found, usage: { ...found.usage, usageSource: "reported", streamAborted: true } };
      }
      const categories = found.usage.categories.map((c) =>
        c.type === "output" ? { ...c, tokens: c.tokens + estimatedOutput - reported } : c,
      );
      if (!categories.some((c) => c.type === "output")) categories.push({ type: "output", tokens: estimatedOutput - reported });
      return {
        ...found,
        usage: { ...found.usage, featureOutputTokens: estimatedOutput, categories, usageSource: "estimated", streamAborted: true },
      };
    }
    const estimatedInput = estimateTokens(inputBytes);
    if (estimatedInput === 0 && estimatedOutput === 0) return undefined;
    return {
      format: this.body.type === "message" ? "anthropic" : this.body.usageMetadata ? "gemini" : "openai",
      id: stringValue(this.body.id ?? this.body.responseId) || undefined,
      model: stringValue(this.body.model ?? this.body.modelVersion) || undefined,
      usage: {
        featureInputTokens: estimatedInput,
        featureOutputTokens: estimatedOutput,
        categories: compactCategories([
          { type: "input", tokens: estimatedInput },
          { type: "output", tokens: estimatedOutput },
        ]),
        usageSource: "estimated",
        streamAborted: true,
      },
    };
  }
}

const encoder = new TextEncoder();

function utf8Bytes(value: unknown): number {
  return typeof value === "string" ? encoder.encode(value).length : 0;
}

/** UTF-8 bytes of the text, tool-call arguments and thinking a stream event delivers. */
function deltaTextBytes(event: any): number {
  const size = utf8Bytes;
  let bytes = typeof event.delta === "string" ? size(event.delta) : size(event.delta?.text) + size(event.delta?.partial_json) + size(event.delta?.thinking);
  for (const choice of Array.isArray(event.choices) ? event.choices : []) {
    bytes += size(choice?.delta?.content);
    for (const call of Array.isArray(choice?.delta?.tool_calls) ? choice.delta.tool_calls : []) bytes += size(call?.function?.arguments);
  }
  for (const candidate of Array.isArray(event.candidates) ? event.candidates : []) {
    for (const part of Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []) bytes += size(part?.text);
  }
  return bytes;
}

/** UTF-8 bytes of the message text in a request body: chat `messages`, Anthropic `system`, Responses `input`, Gemini `contents`. */
export function requestTextBytes(body: any): number {
  const walk = (value: any, depth: number): number => {
    if (typeof value === "string") return utf8Bytes(value);
    if (!value || typeof value !== "object" || depth > 6) return 0;
    if (Array.isArray(value)) return value.reduce((sum: number, item: any) => sum + walk(item, depth + 1), 0);
    return walk(value.text, depth + 1) + walk(value.content, depth + 1) + walk(value.parts, depth + 1) + walk(value.input, depth + 1);
  };
  if (!body || typeof body !== "object") return 0;
  return walk(body.messages, 0) + walk(body.system, 0) + walk(body.input, 0) + walk(body.contents, 0);
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
  const batch = params.usage.serviceTier === "batch";
  const properties = {
    ...(params.provider && { provider: params.provider }),
    model,
    input_tokens: params.usage.featureInputTokens,
    output_tokens: params.usage.featureOutputTokens,
    ...breakdownProperties(params.usage.categories),
    ...(batch && { service_tier: "batch" }),
    latency_ms: params.latencyMs,
    usage_source: params.usage.usageSource ?? "reported",
    ...(params.usage.streamAborted && { stream_aborted: true }),
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
    ? params.usage.categories.map((category) => {
        // A batch-tier call prices its text input and output at the batch rates.
        const type = batch && (category.type === "input" || category.type === "output") ? (`batch_${category.type}` as const) : category.type;
        return params.nozle.costEvents.track({
          costEventId: `${transactionId}:${type}`,
          costMeterCode: params.costMeterCode as string,
          parentTransactionId: transactionId,
          requestId,
          operationKey: type,
          properties: {
            tokens: category.tokens,
            provider: params.provider,
            model,
            type,
          },
          timestamp: Math.floor(occurredAt.getTime() / 1000),
        });
      })
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
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

function breakdownProperties(categories: ProviderTokenUsage["categories"]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const { type, tokens } of categories) {
    const key = BREAKDOWN_PROPERTY[type];
    if (key && tokens > 0) out[key] = tokens;
  }
  return out;
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
  /** Cache writes at the default (5 minute) TTL. */
  cacheWriteTokens?: number;
  /** Cache writes at the 1 hour TTL. */
  cacheWrite1hTokens?: number;
  reasoningTokens?: number;
  audioInputTokens?: number;
  audioOutputTokens?: number;
  imageInputTokens?: number;
  imageOutputTokens?: number;
  /** `batch` when the call was billed at the provider's batch tier. */
  serviceTier?: "batch" | "standard";
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
  const inParts = take(
    input,
    params.cachedInputTokens,
    params.cacheWriteTokens,
    params.cacheWrite1hTokens,
    params.audioInputTokens,
    params.imageInputTokens,
  );
  const outParts = take(output, params.reasoningTokens, params.audioOutputTokens, params.imageOutputTokens);
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
        { type: "input", tokens: inParts.rest },
        { type: "cached_input", tokens: inParts.parts[0] },
        { type: "cache_write", tokens: inParts.parts[1] },
        { type: "cache_write_1h", tokens: inParts.parts[2] },
        { type: "audio_input", tokens: inParts.parts[3] },
        { type: "image_input", tokens: inParts.parts[4] },
        { type: "output", tokens: outParts.rest },
        { type: "reasoning", tokens: outParts.parts[0] },
        { type: "audio_output", tokens: outParts.parts[1] },
        { type: "image_output", tokens: outParts.parts[2] },
      ]),
      ...(params.serviceTier === "batch" && { serviceTier: "batch" as const }),
    },
  });
  const failed = results.find((result) => result.status === "rejected");
  if (failed) throw (failed as PromiseRejectedResult).reason;
}
