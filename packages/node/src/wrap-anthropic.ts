import type { Nozle } from "./client";
import { captureProviderUsage, normalizeAnthropicUsage } from "./provider-usage";
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
      captureProviderUsage({
        nozle,
        customerId: opts.customerId,
        featureCode: opts.metricCode ?? "llm_tokens",
        feature: opts.feature,
        costMeterCode: opts.costMeterCode,
        provider: "anthropic",
        model: (result as any).model ?? params.model,
        requestId: (result as any).id,
        usage: normalizeAnthropicUsage(usage),
        latencyMs: Date.now() - start,
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
  let usage: any = null;
  let responseModel = model;
  let requestId: unknown;

  for await (const event of stream) {
    if (event.type === "message_start" && event.message) {
      usage = event.message.usage ?? usage;
      responseModel = event.message.model ?? responseModel;
      requestId = event.message.id ?? requestId;
    }
    if (event.type === "message_delta" && event.usage) {
      usage = { ...(usage ?? {}), ...event.usage };
    }
    yield event;
  }

  if (usage) {
    captureProviderUsage({
      nozle,
      customerId: opts.customerId,
      featureCode: opts.metricCode ?? "llm_tokens",
      feature: opts.feature,
      costMeterCode: opts.costMeterCode,
      provider: "anthropic",
      model: responseModel,
      requestId,
      usage: normalizeAnthropicUsage(usage),
      latencyMs: Date.now() - start,
    });
  }
}
