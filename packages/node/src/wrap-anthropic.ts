import type { Nozle } from "./client";
import type { WrapOptions } from "./wrap-openai";

export function wrapAnthropic<T extends { messages: { create: Function } }>(
  client: T,
  nozle: Nozle,
  opts: WrapOptions,
): T {
  const original = client.messages.create.bind(client.messages);

  client.messages.create = async function wrappedCreate(...args: any[]) {
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
        input_tokens: usage.input_tokens ?? 0,
        output_tokens: usage.output_tokens ?? 0,
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
  let inputTokens = 0;
  let outputTokens = 0;

  for await (const event of stream) {
    if (event.type === "message_delta" && event.usage) {
      outputTokens = event.usage.output_tokens ?? outputTokens;
    }
    if (event.type === "message_start" && event.message?.usage) {
      inputTokens = event.message.usage.input_tokens ?? 0;
    }
    yield event;
  }

  if (inputTokens || outputTokens) {
    void nozle.track(opts.customerId, opts.metricCode ?? "llm_tokens", {
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      latency_ms: Date.now() - start,
      ...(opts.feature && { feature: opts.feature }),
    });
  }
}
