import type { Nozle } from "./client";
import { recordOnRead, type WrapOptions } from "./wrap-openai";

export function wrapAnthropic<T extends { messages: { create: Function } }>(
  client: T,
  nozle: Nozle,
  opts: WrapOptions,
): T {
  const original = client.messages.create.bind(client.messages);

  client.messages.create = function wrappedCreate(...args: any[]) {
    return recordOnRead(original(...args), args[0] ?? {}, nozle, opts, "anthropic");
  };

  return client;
}
