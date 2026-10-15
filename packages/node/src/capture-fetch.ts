import type { Nozle } from "./client";
import {
  captureProviderUsage,
  detectUsage,
  StreamUsageCollector,
  type DetectedUsage,
} from "./provider-usage";

/** The request a captured call was made with, for choosing the customer per request. */
export interface CaptureRequest {
  url: string;
  method: string;
  headers: Headers;
}

export interface CaptureFetchOptions {
  /**
   * The customer to bill. A function is called for every request, so one shared provider client
   * can bill the right customer. A request can also name its customer with the
   * `X-Nozle-Customer-Id` header, which wins and is not sent to the provider.
   */
  customerId?: string | ((request: CaptureRequest) => string | undefined);
  /** Feature code of the usage event. Default `llm_tokens`. */
  featureCode?: string;
  /** Stored as the `feature` property. The `X-Nozle-Feature` request header wins. */
  feature?: string;
  /** Also send one cost event per token category to this cost meter. */
  costMeterCode?: string;
  /**
   * Ask OpenAI-compatible chat streams to include usage (`stream_options.include_usage`), which
   * they otherwise leave out. Default true. Turn it off for a server that rejects the field.
   */
  includeStreamUsage?: boolean;
  /** Called when usage could not be read or recorded. The provider response is never affected. */
  onError?: (error: unknown) => void;
}

const CUSTOMER_HEADER = "x-nozle-customer-id";
const FEATURE_HEADER = "x-nozle-feature";

/**
 * Returns a `fetch` that passes every request through unchanged and records the token usage of
 * each successful LLM response. Pass it to any client that accepts a custom `fetch`: the OpenAI
 * and Anthropic SDKs, the Vercel AI SDK providers, LangChain, or your own code. Usage is
 * recognised by the shape of the response, so any OpenAI-compatible API, Anthropic and Gemini
 * work without naming the provider. Streams are read in the background as the app reads them.
 */
export function captureFetch(
  nozle: Nozle,
  options: CaptureFetchOptions = {},
  fetchImpl: typeof fetch = globalThis.fetch,
): typeof fetch {
  if (typeof fetchImpl !== "function") throw new Error("captureFetch requires a fetch implementation");
  const report = (error: unknown) => {
    try {
      options.onError?.(error);
    } catch {
      // The provider response must not depend on the error callback.
    }
  };

  return async function capturedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const started = Date.now();
    let prepared: Prepared;
    try {
      prepared = prepare(input, init, options);
    } catch (error) {
      report(error);
      return fetchImpl(input, init);
    }

    const response = await fetchImpl(prepared.input, prepared.init);
    if (!prepared.customerId || !response.ok || !response.body) return response;

    const contentType = response.headers.get("content-type") ?? "";
    const record = (found: DetectedUsage | undefined) => {
      if (!found) return;
      void captureProviderUsage({
        nozle,
        customerId: prepared.customerId as string,
        featureCode: options.featureCode ?? "llm_tokens",
        feature: prepared.feature,
        costMeterCode: options.costMeterCode,
        provider: found.format,
        providerHost: prepared.host,
        model: found.model ?? prepared.model,
        requestId: found.id,
        usage: found.usage,
        latencyMs: Date.now() - started,
      }).then((results) => {
        for (const result of results) if (result.status === "rejected") report(result.reason);
      });
    };

    try {
      if (contentType.includes("text/event-stream")) {
        const [forApp, forUsage] = response.body.tee();
        void readStream(forUsage).then(record, report);
        return new Response(forApp, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      }
      if (contentType.includes("json")) {
        void response
          .clone()
          .json()
          .then((body) => record(detectUsage(body)), report);
      }
    } catch (error) {
      report(error);
    }
    return response;
  };
}

interface Prepared {
  input: RequestInfo | URL;
  init?: RequestInit;
  customerId?: string;
  feature?: string;
  model?: string;
  host?: string;
}

function prepare(input: RequestInfo | URL, init: RequestInit | undefined, options: CaptureFetchOptions): Prepared {
  const request = typeof Request !== "undefined" && input instanceof Request ? input : undefined;
  const url = new URL(request ? request.url : String(input));
  const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
  const headers = new Headers(init?.headers ?? request?.headers);

  const fromHeader = headers.get(CUSTOMER_HEADER)?.trim() || undefined;
  const feature = headers.get(FEATURE_HEADER)?.trim() || options.feature;
  const hadNozleHeaders = headers.has(CUSTOMER_HEADER) || headers.has(FEATURE_HEADER);
  headers.delete(CUSTOMER_HEADER);
  headers.delete(FEATURE_HEADER);

  const customerId =
    fromHeader ??
    (typeof options.customerId === "function"
      ? options.customerId({ url: url.toString(), method, headers })
      : options.customerId);

  let body = init?.body;
  let model: string | undefined;
  if (typeof body === "string" && method === "POST") {
    const parsed = parseJson(body);
    if (parsed && typeof parsed === "object") {
      model = typeof parsed.model === "string" ? parsed.model : undefined;
      // Chat completion streams leave usage out unless asked; the request path is the API contract.
      if (
        customerId &&
        options.includeStreamUsage !== false &&
        parsed.stream === true &&
        Array.isArray(parsed.messages) &&
        url.pathname.endsWith("/chat/completions")
      ) {
        body = JSON.stringify({ ...parsed, stream_options: { ...parsed.stream_options, include_usage: true } });
      }
    }
  }

  if (!hadNozleHeaders && body === init?.body) {
    return { input, init, customerId, feature, model, host: url.host };
  }
  const nextInit: RequestInit = { ...init, headers, body };
  return { input: request ? new Request(request, nextInit) : input, init: nextInit, customerId, feature, model, host: url.host };
}

async function readStream(stream: ReadableStream<Uint8Array>): Promise<DetectedUsage | undefined> {
  const collector = new StreamUsageCollector();
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;
  const line = (text: string) => {
    if (finished || !text.startsWith("data:")) return;
    const data = text.slice(5).trim();
    // "[DONE]" ends an OpenAI-style stream; nothing after it belongs to the response.
    if (data === "[DONE]") finished = true;
    if (!data || finished) return;
    collector.add(parseJson(data));
  };
  for (;;) {
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await reader.read();
    } catch {
      // The app aborted the request; usage already seen still counts.
      break;
    }
    const { value, done } = chunk;
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let end: number;
    while ((end = buffer.indexOf("\n")) >= 0) {
      line(buffer.slice(0, end).replace(/\r$/, ""));
      buffer = buffer.slice(end + 1);
    }
  }
  line(buffer.trim());
  return collector.result();
}

function parseJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
