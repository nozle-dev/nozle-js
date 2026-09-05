import type { Nozle } from "./client";
import { captureProviderUsage, normalizeOpenAIUsage } from "./provider-usage";

export interface WrapOptions {
  customerId: string;
  metricCode?: string;
  feature?: string;
  costMeterCode?: string;
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
      captureProviderUsage({
        nozle,
        customerId: opts.customerId,
        featureCode: opts.metricCode ?? "llm_tokens",
        feature: opts.feature,
        costMeterCode: opts.costMeterCode,
        provider: "openai",
        model: (result as any).model ?? params.model,
        requestId: (result as any).id,
        usage: normalizeOpenAIUsage(usage),
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

  for await (const chunk of stream) {
    if (chunk.usage) usage = chunk.usage;
    if (chunk.model) responseModel = chunk.model;
    if (chunk.id) requestId = chunk.id;
    yield chunk;
  }

  if (usage) {
    captureProviderUsage({
      nozle,
      customerId: opts.customerId,
      featureCode: opts.metricCode ?? "llm_tokens",
      feature: opts.feature,
      costMeterCode: opts.costMeterCode,
      provider: "openai",
      model: responseModel,
      requestId,
      usage: normalizeOpenAIUsage(usage),
      latencyMs: Date.now() - start,
    });
  }
}
