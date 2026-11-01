import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";
import { captureFetch } from "../capture-fetch";
import { EventBuffer } from "../event-buffer";
import type { TrackBatchEvent, TrackBatchOptions, TrackBatchResult } from "../types";
import { wrapAnthropic } from "../wrap-anthropic";
import { wrapOpenAI } from "../wrap-openai";

// The wrappers and captureFetch given a buffer queue usage there; a flush or close sends it.

function tracker() {
  return {
    events: { createTransactionId: vi.fn(() => "txn_random") },
    track: vi.fn(() => Promise.resolve("txn")),
    costEvents: { track: vi.fn(() => Promise.resolve({ status: "accepted" })) },
  };
}

function eventBuffer() {
  const sent: TrackBatchEvent[] = [];
  const sendBatch = vi.fn(async (events: TrackBatchEvent[], _options: TrackBatchOptions): Promise<TrackBatchResult> => {
    sent.push(...events);
    return { results: events.map((event, index) => ({ index, transactionId: event.transactionId!, status: "accepted" as const })) };
  });
  return { buffer: new EventBuffer(sendBatch, { flushIntervalMs: 0 }), sendBatch, sent };
}

const json = (body: unknown) => () =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const sse = (events: Array<[string | null, unknown]>) => () =>
  new Response(
    events.map(([event, data]) => `${event ? `event: ${event}\n` : ""}data: ${JSON.stringify(data)}\n\n`).join(""),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );
const providerFetch = (respond: () => Response) => vi.fn(async () => respond()) as unknown as typeof globalThis.fetch;

const completion = {
  id: "chatcmpl_1",
  object: "chat.completion",
  created: 1,
  model: "gpt-test",
  choices: [{ index: 0, message: { role: "assistant", content: "hi", refusal: null }, finish_reason: "stop", logprobs: null }],
  usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 },
};
const request = { model: "gpt-test", messages: [{ role: "user" as const, content: "hi" }] };

describe("LLM capture with an event buffer", () => {
  it("wrapOpenAI queues the usage event and sends it only on flush", async () => {
    const nozle = tracker();
    const { buffer, sendBatch, sent } = eventBuffer();
    const openai = new OpenAI({ apiKey: "sk-test", fetch: providerFetch(json(completion)), maxRetries: 0 });
    const client = wrapOpenAI(openai, nozle as any, { customerId: "customer_1", metricCode: "tokens", buffer });

    await client.chat.completions.create(request);

    expect(nozle.track).not.toHaveBeenCalled();
    expect(sendBatch).not.toHaveBeenCalled();
    expect(buffer.size).toBe(1);
    await buffer.flush();
    expect(sent).toEqual([
      expect.objectContaining({
        customerId: "customer_1",
        event: "tokens",
        transactionId: "llm-openai-chatcmpl_1",
        metadata: expect.objectContaining({ provider: "openai", model: "gpt-test", input_tokens: 12, output_tokens: 3 }),
      }),
    ]);
    await buffer.close();
  });

  it("wrapAnthropic queues a streamed call's usage and close sends it", async () => {
    const nozle = tracker();
    const { buffer, sent } = eventBuffer();
    const stream = sse([
      ["message_start", { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: "claude-test", content: [], usage: { input_tokens: 9, output_tokens: 1 } } }],
      ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 4 } }],
      ["message_stop", { type: "message_stop" }],
    ]);
    const anthropic = new Anthropic({ apiKey: "sk-test", fetch: providerFetch(stream), maxRetries: 0 });
    const client = wrapAnthropic(anthropic, nozle as any, { customerId: "customer_1", buffer });

    for await (const _event of await client.messages.create({ model: "claude-test", max_tokens: 10, messages: [{ role: "user", content: "hi" }], stream: true }));

    expect(nozle.track).not.toHaveBeenCalled();
    await buffer.close();
    expect(sent).toEqual([
      expect.objectContaining({ event: "llm_tokens", transactionId: "llm-anthropic-msg_1", metadata: expect.objectContaining({ input_tokens: 9, output_tokens: 4 }) }),
    ]);
  });

  it("captureFetch: flush waits for a JSON response still being read", async () => {
    const nozle = tracker();
    const { buffer, sent } = eventBuffer();
    const fetch = captureFetch(nozle as any, { customerId: "customer_1", buffer }, providerFetch(json(completion)));

    await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", body: JSON.stringify(request) });
    await buffer.flush();

    expect(nozle.track).not.toHaveBeenCalled();
    expect(sent.map((event) => event.transactionId)).toEqual(["llm-openai-chatcmpl_1"]);
    await buffer.close();
  });

  it("captureFetch: close waits for a stream the app never read, and for cost events", async () => {
    const nozle = tracker();
    const deliveries: Array<() => void> = [];
    nozle.costEvents.track.mockImplementation(() => new Promise((resolve) => deliveries.push(() => resolve({ status: "accepted" }))));
    const { buffer, sent } = eventBuffer();
    const chunks = sse([
      [null, { id: "chatcmpl_2", model: "gpt-test", choices: [{ delta: { content: "hi" } }] }],
      [null, { id: "chatcmpl_2", model: "gpt-test", choices: [], usage: { prompt_tokens: 5, completion_tokens: 2 } }],
    ]);
    const fetch = captureFetch(nozle as any, { customerId: "customer_1", costMeterCode: "ai_tokens", buffer }, providerFetch(chunks));

    await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", body: JSON.stringify({ ...request, stream: true }) });
    let closed = false;
    const closing = buffer.close().then(() => (closed = true));
    await vi.waitFor(() => expect(nozle.costEvents.track).toHaveBeenCalled());
    expect(closed).toBe(false);
    for (const deliver of deliveries) deliver();
    await closing;

    expect(sent.map((event) => event.transactionId)).toEqual(["llm-openai-chatcmpl_2"]);
    expect(nozle.track).not.toHaveBeenCalled();
  });

  it("without a buffer, usage is sent at once as before", async () => {
    const nozle = tracker();
    const openai = new OpenAI({ apiKey: "sk-test", fetch: providerFetch(json(completion)), maxRetries: 0 });
    await wrapOpenAI(openai, nozle as any, { customerId: "customer_1" }).chat.completions.create(request);
    expect(nozle.track).toHaveBeenCalledWith(
      "customer_1",
      "llm_tokens",
      expect.objectContaining({ input_tokens: 12 }),
      expect.objectContaining({ transactionId: "llm-openai-chatcmpl_1" }),
    );
  });
});
