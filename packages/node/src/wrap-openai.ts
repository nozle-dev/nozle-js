import type { Nozle } from "./client";
import { holdUntilFlushed, type EventBuffer } from "./event-buffer";
import { captureProviderUsage, detectUsage, requestTextBytes, StreamUsageCollector, type DetectedUsage } from "./provider-usage";

export interface WrapOptions {
  customerId: string;
  metricCode?: string;
  feature?: string;
  costMeterCode?: string;
  /** Receives recording failures and a missing Feature for `metricCode`. Without it recording failures are emitted as a `NozleTrackingWarning` process warning. */
  onError?: (error: unknown) => void;
  /**
   * Queues each usage event in this buffer instead of sending it at once, so `await buffer.flush()` or
   * `buffer.close()` sends it. Its delivery failures then go to the buffer's `onError`. Cost events are still
   * sent directly, and the buffer's `flush()` and `close()` wait for them.
   */
  buffer?: EventBuffer;
}

export function wrapOpenAI<T extends { chat: { completions: { create: Function } } }>(
  client: T,
  nozle: Nozle,
  opts: WrapOptions,
): T {
  return withMethod(client, ["chat", "completions", "create"], (original) => (...args: any[]) => {
    const params = { ...(args[0] ?? {}) };
    if (params.stream) {
      params.stream_options = { ...(params.stream_options ?? {}), include_usage: true };
      args[0] = params;
    }
    return recordOnRead(original(...args), params, nozle, opts, "openai");
  });
}

const originals = new WeakMap<object, object>();

/**
 * Returns a view of `client` whose method at `path` is replaced by `wrap(original)`, as the Go SDK
 * returns a copy. The client passed in is never changed, so wrapping one shared client per request
 * keeps each wrapper's customer to its own calls. Wrapping a view wraps its original client again.
 */
export function withMethod<T extends object>(client: T, path: string[], wrap: (original: Function) => Function): T {
  const source: any = originals.get(client) ?? client;
  let root: any;
  const view = (target: any, depth: number): any => {
    const key = path[depth];
    const child = depth === path.length - 1 ? wrap(target[key].bind(target)) : view(target[key], depth + 1);
    return new Proxy(target, {
      get(t, prop) {
        if (prop === key) return child;
        // SDK helpers such as OpenAI's parse() and stream() call back through `this._client`.
        if (prop === "_client" && depth > 0 && t._client === source) return root;
        const value = Reflect.get(t, prop);
        // Client methods read private fields, which a proxy receiver cannot reach.
        return depth === 0 && typeof value === "function" ? value.bind(t) : value;
      },
    });
  };
  root = view(source, 0);
  originals.set(root, source);
  return root;
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
      buffer: opts.buffer,
    });
  };
  const record = (value: any) => (params.stream ? recordStream(value, report, requestTextBytes(params)) : report(detectUsage(value)));

  // An SDK APIPromise parses the body only when read; reading it here would take the body from
  // `asResponse()` and from helpers like `parse()`. `_thenUnwrap` gives the same kind of promise,
  // which records when the caller reads it.
  if (typeof result?._thenUnwrap === "function") {
    return result._thenUnwrap((value: any) => {
      record(value);
      return value;
    });
  }
  const recorded = Promise.resolve(result).then(record, () => {});
  if (opts.buffer) holdUntilFlushed(opts.buffer, recorded);
  return result;
}

/**
 * Folds the events into usage as the caller iterates, keeping the stream object and its helpers.
 * Usage is also recorded when the caller breaks out or the stream throws: the provider's partial
 * report, or an estimate, flagged `stream_aborted`.
 */
function recordStream(stream: any, report: (detected: DetectedUsage | undefined) => void, inputBytes: number): void {
  const iterate = stream?.[Symbol.asyncIterator];
  if (typeof iterate !== "function") return;
  // shortcut: SDK `tee()` reads the stream's internal iterator, so tee'd branches are not recorded; patch that too if needed.
  stream[Symbol.asyncIterator] = async function* () {
    const collector = new StreamUsageCollector();
    let ended = false;
    try {
      for await (const event of { [Symbol.asyncIterator]: () => iterate.call(stream) }) {
        collector.add(event);
        yield event;
      }
      ended = true;
    } finally {
      report(collector.result(ended, inputBytes));
    }
  };
}
