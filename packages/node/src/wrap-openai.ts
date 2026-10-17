import type { Nozle } from "./client";
import { captureProviderUsage, detectUsage, StreamUsageCollector, type DetectedUsage } from "./provider-usage";

export interface WrapOptions {
  customerId: string;
  metricCode?: string;
  feature?: string;
  costMeterCode?: string;
  /** Receives recording failures and a missing Feature for `metricCode`. Without it they are silent. */
  onError?: (error: unknown) => void;
}

export function wrapOpenAI<T extends { chat: { completions: { create: Function } } }>(
  client: T,
  nozle: Nozle,
  opts: WrapOptions,
): T {
  const original = client.chat.completions.create.bind(client.chat.completions);

  client.chat.completions.create = function wrappedCreate(...args: any[]) {
    const params = { ...(args[0] ?? {}) };
    if (params.stream) {
      params.stream_options = { ...(params.stream_options ?? {}), include_usage: true };
      args[0] = params;
    }
    return recordOnRead(original(...args), params, nozle, opts, "openai");
  };

  return client;
}

/**
 * Returns the SDK's own result unchanged, so `withResponse()`, `asResponse()`, `parse()` and the
 * stream helpers keep working, and records usage when the caller reads the response. Usage is
 * found by response shape, as `captureFetch` does.
 */
export function recordOnRead(result: any, params: any, nozle: Nozle, opts: WrapOptions, provider: string): any {
  const start = Date.now();
  const report = (detected: DetectedUsage | undefined) => {
    if (!detected) return;
    captureProviderUsage({
      nozle,
      customerId: opts.customerId,
      featureCode: opts.metricCode ?? "llm_tokens",
      feature: opts.feature,
      costMeterCode: opts.costMeterCode,
      provider,
      model: detected.model ?? params.model,
      requestId: detected.id,
      usage: detected.usage,
      latencyMs: Date.now() - start,
      onError: opts.onError,
    });
  };
  const record = (value: any) => (params.stream ? recordStream(value, report) : report(detectUsage(value)));

  // An SDK APIPromise parses the body only when read; reading it here would take the body from
  // `asResponse()` and from helpers like `parse()`. `_thenUnwrap` gives the same kind of promise,
  // which records when the caller reads it.
  if (typeof result?._thenUnwrap === "function") {
    return result._thenUnwrap((value: any) => {
      record(value);
      return value;
    });
  }
  Promise.resolve(result).then(record, () => {});
  return result;
}

/** Folds the events into usage as the caller iterates, keeping the stream object and its helpers. */
function recordStream(stream: any, report: (detected: DetectedUsage | undefined) => void): void {
  const iterate = stream?.[Symbol.asyncIterator];
  if (typeof iterate !== "function") return;
  // shortcut: SDK `tee()` reads the stream's internal iterator, so tee'd branches are not recorded; patch that too if needed.
  stream[Symbol.asyncIterator] = async function* () {
    const collector = new StreamUsageCollector();
    for await (const event of { [Symbol.asyncIterator]: () => iterate.call(stream) }) {
      collector.add(event);
      yield event;
    }
    report(collector.result());
  };
}
