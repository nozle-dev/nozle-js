import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";
import { wrapAnthropic } from "../wrap-anthropic";
import { wrapOpenAI } from "../wrap-openai";

// Real SDK clients over a fake fetch, so the wrappers are checked against the SDKs' own
// APIPromise and Stream objects.

function tracker() {
  return {
    events: { createTransactionId: vi.fn(() => "txn_123") },
    track: vi.fn(() => Promise.resolve("txn_123")),
    costEvents: { track: vi.fn(() => Promise.resolve({ status: "accepted" })) },
  };
}

function fakeFetch(respond: () => Response) {
  const bodies: any[] = [];
  const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return respond();
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, bodies };
}

const json = (body: unknown, status = 200) => () =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const sse = (events: Array<[string | null, unknown]>) => () =>
  new Response(
    events.map(([event, data]) => `${event ? `event: ${event}\n` : ""}data: ${JSON.stringify(data)}\n\n`).join("") +
      "data: [DONE]\n\n",
    { headers: { "content-type": "text/event-stream" } },
  );

const completion = {
  id: "chatcmpl_1",
  object: "chat.completion",
  created: 1,
  model: "gpt-test",
  choices: [{ index: 0, message: { role: "assistant", content: "hi", refusal: null }, finish_reason: "stop", logprobs: null }],
  usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 },
};

const message = {
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: "claude-test",
  content: [{ type: "text", text: "hi" }],
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: { input_tokens: 9, output_tokens: 4, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
};

const openai = (fetch: typeof globalThis.fetch) => new OpenAI({ apiKey: "sk-test", fetch, maxRetries: 0 });
const anthropic = (fetch: typeof globalThis.fetch) => new Anthropic({ apiKey: "sk-test", fetch, maxRetries: 0 });
const opts = { customerId: "customer_1", metricCode: "tokens" };
const request = { model: "gpt-test", messages: [{ role: "user" as const, content: "hi" }] };
const anthropicRequest = { model: "claude-test", max_tokens: 10, messages: [{ role: "user" as const, content: "hi" }] };

describe("wrapOpenAI with the OpenAI SDK", () => {
  it("keeps withResponse() and records usage once", async () => {
    const nozle = tracker();
    const client = wrapOpenAI(openai(fakeFetch(json(completion)).fetch), nozle as any, opts);

    const { data, response } = await client.chat.completions.create(request).withResponse();

    expect(data.id).toBe("chatcmpl_1");
    expect(response.status).toBe(200);
    expect(nozle.track).toHaveBeenCalledTimes(1);
    expect(nozle.track).toHaveBeenCalledWith(
      "customer_1",
      "tokens",
      expect.objectContaining({ provider: "openai", model: "gpt-test", input_tokens: 12, output_tokens: 3 }),
      expect.objectContaining({ transactionId: "llm-openai-chatcmpl_1" }),
    );
  });

  it("keeps chat.completions.parse(), which builds on the create() promise", async () => {
    const nozle = tracker();
    const client = wrapOpenAI(openai(fakeFetch(json(completion)).fetch), nozle as any, opts);

    const parsed = await client.chat.completions.parse(request);

    expect(parsed.choices[0].message.content).toBe("hi");
    expect(nozle.track).toHaveBeenCalledTimes(1);
  });

  it("leaves the body to asResponse()", async () => {
    const nozle = tracker();
    const client = wrapOpenAI(openai(fakeFetch(json(completion)).fetch), nozle as any, opts);

    const response = await client.chat.completions.create(request).asResponse();

    expect((await response.json()).id).toBe("chatcmpl_1");
  });

  it("yields the same stream chunks, keeps the Stream helpers and records usage once", async () => {
    const nozle = tracker();
    const chunks = [
      { id: "chatcmpl_2", object: "chat.completion.chunk", created: 1, model: "gpt-test", choices: [{ index: 0, delta: { content: "hi" }, finish_reason: null }], usage: null },
      { id: "chatcmpl_2", object: "chat.completion.chunk", created: 1, model: "gpt-test", choices: [], usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 } },
    ];
    const { fetch, bodies } = fakeFetch(sse(chunks.map((chunk) => [null, chunk])));
    const client = wrapOpenAI(openai(fetch), nozle as any, opts);

    const { data: stream } = await client.chat.completions.create({ ...request, stream: true }).withResponse();
    expect(stream.controller).toBeInstanceOf(AbortController);
    expect(typeof stream.toReadableStream).toBe("function");
    const seen = [];
    for await (const chunk of stream) seen.push(chunk);

    expect(seen).toEqual(chunks);
    expect(bodies[0].stream_options).toEqual({ include_usage: true });
    expect(nozle.track).toHaveBeenCalledTimes(1);
    expect(nozle.track).toHaveBeenCalledWith(
      "customer_1",
      "tokens",
      expect.objectContaining({ input_tokens: 20, output_tokens: 5 }),
      expect.objectContaining({ transactionId: "llm-openai-chatcmpl_2" }),
    );
  });

  it("rejects errors to the caller and records nothing", async () => {
    const nozle = tracker();
    const client = wrapOpenAI(
      openai(fakeFetch(json({ error: { message: "bad", type: "invalid_request_error" } }, 400)).fetch),
      nozle as any,
      opts,
    );

    await expect(client.chat.completions.create(request)).rejects.toBeInstanceOf(OpenAI.BadRequestError);
    expect(nozle.track).not.toHaveBeenCalled();
  });
});

describe("wrapAnthropic with the Anthropic SDK", () => {
  it("keeps withResponse() and records usage once", async () => {
    const nozle = tracker();
    const client = wrapAnthropic(anthropic(fakeFetch(json(message)).fetch), nozle as any, opts);

    const { data, response } = await client.messages.create(anthropicRequest).withResponse();

    expect(data.id).toBe("msg_1");
    expect(response.status).toBe(200);
    expect(nozle.track).toHaveBeenCalledTimes(1);
    expect(nozle.track).toHaveBeenCalledWith(
      "customer_1",
      "tokens",
      expect.objectContaining({ provider: "anthropic", model: "claude-test", input_tokens: 9, output_tokens: 4 }),
      expect.objectContaining({ transactionId: "llm-anthropic-msg_1" }),
    );
  });

  it("keeps messages.stream() and finalMessage(), recording usage once", async () => {
    const nozle = tracker();
    const events: Array<[string, unknown]> = [
      ["message_start", { type: "message_start", message: { ...message, content: [], usage: { input_tokens: 9, output_tokens: 1 } } }],
      ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
      ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "hi" } }],
      ["content_block_stop", { type: "content_block_stop", index: 0 }],
      ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 4 } }],
      ["message_stop", { type: "message_stop" }],
    ];
    const client = wrapAnthropic(anthropic(fakeFetch(sse(events)).fetch), nozle as any, opts);

    const final = await client.messages.stream(anthropicRequest).finalMessage();

    expect(final.content).toMatchObject([{ type: "text", text: "hi" }]);
    expect(nozle.track).toHaveBeenCalledTimes(1);
    expect(nozle.track).toHaveBeenCalledWith(
      "customer_1",
      "tokens",
      expect.objectContaining({ input_tokens: 9, output_tokens: 4 }),
      expect.objectContaining({ transactionId: "llm-anthropic-msg_1" }),
    );
  });

  it("rejects errors to the caller and records nothing", async () => {
    const nozle = tracker();
    const client = wrapAnthropic(
      anthropic(fakeFetch(json({ type: "error", error: { type: "invalid_request_error", message: "bad" } }, 400)).fetch),
      nozle as any,
      opts,
    );

    await expect(client.messages.create(anthropicRequest)).rejects.toBeInstanceOf(Anthropic.BadRequestError);
    expect(nozle.track).not.toHaveBeenCalled();
  });
});
