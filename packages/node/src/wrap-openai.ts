import type { Nozle } from "./client";

export interface WrapOptions {
  customerId: string;
  metricCode?: string;
  feature?: string;
}

export function wrapOpenAI<T extends { chat: { completions: { create: Function } } }>(
  client: T,
  nozle: Nozle,
  opts: WrapOptions,
): T {
  const original = client.chat.completions.create.bind(client.chat.completions);

  client.chat.completions.create = async function wrappedCreate(...args: any[]) {
    const start = Date.now();
    const params = args[0] ?? {};
    const result = await original(...args);

    if (params.stream) {
      return wrapStream(result, nozle, opts, params.model, start);
    }

    const usage = (result as any).usage;
    if (usage) {
      void nozle.track(opts.customerId, opts.metricCode ?? "llm_tokens", {
        model: (result as any).model ?? params.model,
        input_tokens: usage.prompt_tokens ?? 0,
        output_tokens: usage.completion_tokens ?? 0,
        latency_ms: Date.now() - start,
        ...(opts.feature && { feature: opts.feature }),
      });
    }
    return result;
  };

  return client;
}

async function* wrapStream(
  stream: any,
  nozle: Nozle,
  opts: WrapOptions,
  model: string,
  start: number,
): AsyncGenerator<any> {
  let usage: { prompt_tokens?: number; completion_tokens?: number } | null = null;

  for await (const chunk of stream) {
    if (chunk.usage) usage = chunk.usage;
    yield chunk;
  }

  if (usage) {
    void nozle.track(opts.customerId, opts.metricCode ?? "llm_tokens", {
      model,
      input_tokens: usage.prompt_tokens ?? 0,
      output_tokens: usage.completion_tokens ?? 0,
      latency_ms: Date.now() - start,
      ...(opts.feature && { feature: opts.feature }),
    });
  }
}
