import type { Nozle } from "./client";
import { recordOnRead, withMethod, type WrapOptions } from "./wrap-openai";

export function wrapAnthropic<T extends { messages: { create: Function } }>(
  client: T,
  nozle: Nozle,
  opts: WrapOptions,
): T {
  return withMethod(client, ["messages", "create"], (original) => (...args: any[]) =>
    recordOnRead(original(...args), args[0] ?? {}, nozle, opts, "anthropic"),
  );
}
