import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";
import { captureFetch } from "../capture-fetch";
import {
  detectUsage,
  ESTIMATE_BYTES_PER_TOKEN,
  estimateTokens,
  normalizeAnthropicUsage,
  normalizeGeminiUsage,
  normalizeOpenAIUsage,
  recordUsage,
} from "../provider-usage";
import { wrapAnthropic } from "../wrap-anthropic";
import { wrapOpenAI } from "../wrap-openai";

function tracker() {
  return {
    events: { createTransactionId: vi.fn(() => "txn_random") },
    track: vi.fn(() => Promise.resolve("txn")),
    costEvents: { track: vi.fn((_params: any) => Promise.resolve({ status: "accepted" })) },
  };
}

const buckets = (usage: { categories: Array<{ type: string; tokens: number }> }) =>
  Object.fromEntries(usage.categories.map((c) => [c.type, c.tokens]));

describe("token buckets", () => {
  it("estimates ceil(bytes / 4)", () => {
    expect(ESTIMATE_BYTES_PER_TOKEN).toBe(4);
    expect([0, 1, 4, 5, 9].map(estimateTokens)).toEqual([0, 1, 1, 2, 3]);
  });

  it("splits OpenAI usage into disjoint buckets with audio and cache writes", () => {
    const usage = normalizeOpenAIUsage({
      prompt_tokens: 100,
      completion_tokens: 40,
      prompt_tokens_details: { cached_tokens: 20, cache_write_tokens: 10, audio_tokens: 5 },
      completion_tokens_details: { reasoning_tokens: 8, audio_tokens: 4 },
    });
    expect(usage.featureInputTokens).toBe(100);
    expect(usage.featureOutputTokens).toBe(40);
    expect(buckets(usage)).toEqual({
      input: 65,
      cached_input: 20,
      cache_write: 10,
      audio_input: 5,
      output: 28,
      reasoning: 8,
      audio_output: 4,
    });
  });

  it("clamps buckets to the totals", () => {
    const usage = normalizeOpenAIUsage({
      prompt_tokens: 10,
      completion_tokens: 3,
      prompt_tokens_details: { cached_tokens: 9, cache_write_tokens: 9, audio_tokens: 9 },
      completion_tokens_details: { reasoning_tokens: 99 },
    });
    expect(buckets(usage)).toEqual({ cached_input: 9, cache_write: 1, reasoning: 3 });
  });

  it("splits Anthropic cache creation by TTL", () => {
    const found = detectUsage({
      type: "message",
      usage: {
        input_tokens: 50,
        cache_read_input_tokens: 20,
        cache_creation_input_tokens: 30,
        cache_creation: { ephemeral_5m_input_tokens: 10, ephemeral_1h_input_tokens: 20 },
        output_tokens: 7,
        service_tier: "batch",
      },
    });
    expect(found?.usage.featureInputTokens).toBe(100);
    expect(buckets(found!.usage)).toEqual({ input: 50, cached_input: 20, cache_write: 10, cache_write_1h: 20, output: 7 });
    expect(found?.usage.serviceTier).toBe("batch");
    expect(buckets(normalizeAnthropicUsage({ input_tokens: 1, cache_creation: { ephemeral_1h_input_tokens: 4 } }))).toEqual({
      input: 1,
      cache_write_1h: 4,
    });
  });

  it("turns Gemini modality arrays into buckets", () => {
    const usage = normalizeGeminiUsage({
      promptTokenCount: 100,
      cachedContentTokenCount: 30,
      candidatesTokenCount: 50,
      thoughtsTokenCount: 6,
      promptTokensDetails: [
        { modality: "TEXT", tokenCount: 50 },
        { modality: "AUDIO", tokenCount: 20 },
        { modality: "IMAGE", tokenCount: 30 },
      ],
      candidatesTokensDetails: [
        { modality: "AUDIO", tokenCount: 12 },
        { modality: "IMAGE", tokenCount: 8 },
      ],
    });
    expect(usage.featureInputTokens).toBe(100);
    expect(usage.featureOutputTokens).toBe(56);
    expect(buckets(usage)).toEqual({
      input: 20,
      cached_input: 30,
      audio_input: 20,
      image_input: 30,
      output: 30,
      reasoning: 6,
      audio_output: 12,
      image_output: 8,
    });
  });

  it("sends breakdown props and per-bucket cost events with the shared cost_event_id shape", async () => {
    const nozle = tracker();
    await recordUsage(nozle as any, {
      customerId: "cust_1",
      model: "claude",
      provider: "anthropic",
      requestId: "r1",
      inputTokens: 100,
      cachedInputTokens: 30,
      cacheWriteTokens: 10,
      cacheWrite1hTokens: 5,
      audioInputTokens: 2,
      outputTokens: 50,
      reasoningTokens: 20,
      serviceTier: "batch",
      costMeterCode: "ai_tokens",
    });
    const props = (nozle.track.mock.calls[0] as any[])[2];
    expect(props).toMatchObject({
      input_tokens: 100,
      output_tokens: 50,
      cached_input_tokens: 30,
      cache_write_tokens: 10,
      cache_write_1h_tokens: 5,
      audio_input_tokens: 2,
      reasoning_tokens: 20,
      service_tier: "batch",
      usage_source: "reported",
    });
    expect(props).not.toHaveProperty("stream_aborted");
    expect(props).not.toHaveProperty("image_input_tokens");
    const events = nozle.costEvents.track.mock.calls.map((call) => call[0]);
    expect(Object.fromEntries(events.map((e) => [e.costEventId, e.properties.type]))).toEqual({
      "llm-anthropic-r1:batch_input": "batch_input",
      "llm-anthropic-r1:cached_input": "cached_input",
      "llm-anthropic-r1:cache_write": "cache_write",
      "llm-anthropic-r1:cache_write_1h": "cache_write_1h",
      "llm-anthropic-r1:audio_input": "audio_input",
      "llm-anthropic-r1:batch_output": "batch_output",
      "llm-anthropic-r1:reasoning": "reasoning",
    });
    expect(events.every((e) => e.operationKey === e.properties.type)).toBe(true);
  });
});

const sseResponse = (events: unknown[], done = true) =>
  new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") + (done ? "data: [DONE]\n\n" : ""), {
    headers: { "content-type": "text/event-stream" },
  });

function fakeFetch(respond: () => Response) {
  return vi.fn(async () => respond()) as unknown as typeof globalThis.fetch;
}

const chunk = (content: string, extra: object = {}) => ({
  id: "chatcmpl_a",
  object: "chat.completion.chunk",
  created: 1,
  model: "gpt-test",
  choices: [{ index: 0, delta: { content }, finish_reason: null }],
  usage: null,
  ...extra,
});
const usageChunk = {
  id: "chatcmpl_a",
  object: "chat.completion.chunk",
  created: 1,
  model: "gpt-test",
  choices: [],
  usage: { prompt_tokens: 9, completion_tokens: 4, total_tokens: 13 },
};
const request = { model: "gpt-test", messages: [{ role: "user" as const, content: "twelve bytes" }], stream: true as const };
const opts = { customerId: "customer_1", metricCode: "tokens" };

describe("aborted streams: client wrappers", () => {
  it("wrapOpenAI records an estimate when the consumer breaks", async () => {
    const nozle = tracker();
    const client = wrapOpenAI(
      new OpenAI({ apiKey: "sk", maxRetries: 0, fetch: fakeFetch(() => sseResponse([chunk("héllo wor"), chunk("ld!"), usageChunk])) }),
      nozle as any,
      opts,
    );
    const stream = await client.chat.completions.create(request);
    let seen = 0;
    for await (const _ of stream) if (++seen === 2) break;

    await vi.waitFor(() => expect(nozle.track).toHaveBeenCalledTimes(1));
    const props = (nozle.track.mock.calls[0] as any[])[2];
    expect(props).toMatchObject({ stream_aborted: true, usage_source: "estimated", input_tokens: 3, output_tokens: 4 }); // ceil(12/4), ceil(13/4)
  });

  it("wrapOpenAI records usage when the stream throws and still throws", async () => {
    const nozle = tracker();
    const client = wrapOpenAI(
      new OpenAI({ apiKey: "sk", maxRetries: 0, fetch: fakeFetch(() => sseResponse([chunk("abcdefgh"), "not json {"], false)) }),
      nozle as any,
      opts,
    );
    const stream = await client.chat.completions.create(request);
    await expect(
      (async () => {
        for await (const _ of stream) throw new Error("consumer failed");
      })(),
    ).rejects.toThrow("consumer failed");

    await vi.waitFor(() => expect(nozle.track).toHaveBeenCalledTimes(1));
    expect((nozle.track.mock.calls[0] as any[])[2]).toMatchObject({ stream_aborted: true, output_tokens: 2 });
  });

  it("wrapOpenAI marks a stream that ends normally as reported, without an abort flag", async () => {
    const nozle = tracker();
    const client = wrapOpenAI(
      new OpenAI({ apiKey: "sk", maxRetries: 0, fetch: fakeFetch(() => sseResponse([chunk("hi"), usageChunk])) }),
      nozle as any,
      opts,
    );
    for await (const _ of await client.chat.completions.create(request));
    await vi.waitFor(() => expect(nozle.track).toHaveBeenCalledTimes(1));
    const props = (nozle.track.mock.calls[0] as any[])[2];
    expect(props).toMatchObject({ usage_source: "reported", input_tokens: 9, output_tokens: 4 });
    expect(props).not.toHaveProperty("stream_aborted");
  });

  const anthropicEvents = (text: string) =>
    [
      { type: "message_start", message: { id: "msg_a", type: "message", role: "assistant", model: "claude-test", content: [], usage: { input_tokens: 25, output_tokens: 1 } } },
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } },
      { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 15 } },
      { type: "message_stop" },
    ].map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
  const anthropicRequest = { model: "claude-test", max_tokens: 10, messages: [{ role: "user" as const, content: "hi" }], stream: true as const };
  const anthropicFetch = (text: string) =>
    fakeFetch(() => new Response(anthropicEvents(text), { headers: { "content-type": "text/event-stream" } }));

  it("wrapAnthropic uses the larger of the reported output and the estimate when the consumer breaks", async () => {
    const nozle = tracker();
    const client = wrapAnthropic(new Anthropic({ apiKey: "sk", maxRetries: 0, fetch: anthropicFetch("a".repeat(40)) }), nozle as any, opts);
    let seen = 0;
    for await (const _ of await client.messages.create(anthropicRequest)) if (++seen === 3) break;

    await vi.waitFor(() => expect(nozle.track).toHaveBeenCalledTimes(1));
    expect((nozle.track.mock.calls[0] as any[])[2]).toMatchObject({
      stream_aborted: true,
      usage_source: "estimated",
      input_tokens: 25,
      output_tokens: 10, // max(1, ceil(40 / 4))
    });
  });

  it("wrapAnthropic keeps reported partial usage when it exceeds the estimate", async () => {
    const nozle = tracker();
    const client = wrapAnthropic(new Anthropic({ apiKey: "sk", maxRetries: 0, fetch: anthropicFetch("ab") }), nozle as any, opts);
    let seen = 0;
    for await (const _ of await client.messages.create(anthropicRequest)) if (++seen === 4) break;

    await vi.waitFor(() => expect(nozle.track).toHaveBeenCalledTimes(1));
    expect((nozle.track.mock.calls[0] as any[])[2]).toMatchObject({ stream_aborted: true, usage_source: "reported", output_tokens: 15 });
  });
});

describe("aborted streams: captureFetch", () => {
  function cutStream(parts: string[], cut: "error" | "close") {
    return () => {
      const encoder = new TextEncoder();
      let index = 0;
      return new Response(
        new ReadableStream({
          async pull(controller) {
            if (index < parts.length) return controller.enqueue(encoder.encode(parts[index++]));
            // Let the readers take what was sent: an error discards queued chunks.
            await new Promise((resolve) => setTimeout(resolve, 20));
            if (cut === "close") controller.close();
            else controller.error(new Error("socket hang up"));
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      );
    };
  }
  const data = (event: unknown) => `data: ${JSON.stringify(event)}\n\n`;
  const send = (fetch: typeof globalThis.fetch) =>
    fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({ model: "gpt-test", messages: [{ role: "user", content: "twelve bytes" }], stream: true }),
    });

  it("records an estimate when the connection drops mid-stream", async () => {
    const nozle = tracker();
    const fetch = captureFetch(nozle as any, { customerId: "cust_1" }, cutStream([data(chunk("abcdefgh"))], "error") as any);
    const response = await send(fetch);
    await response.text().catch(() => undefined);

    await vi.waitFor(() => expect(nozle.track).toHaveBeenCalledTimes(1));
    expect((nozle.track.mock.calls[0] as any[])[2]).toMatchObject({
      stream_aborted: true,
      usage_source: "estimated",
      input_tokens: 3,
      output_tokens: 2,
    });
  });

  it("treats a stream that closes without the provider's final usage as aborted", async () => {
    const nozle = tracker();
    const fetch = captureFetch(nozle as any, { customerId: "cust_1" }, cutStream([data(chunk("abcdefghi"))], "close") as any);
    await (await send(fetch)).text();

    await vi.waitFor(() => expect(nozle.track).toHaveBeenCalledTimes(1));
    expect((nozle.track.mock.calls[0] as any[])[2]).toMatchObject({ stream_aborted: true, usage_source: "estimated", output_tokens: 3 });
  });

  it("does not flag a complete stream", async () => {
    const nozle = tracker();
    const fetch = captureFetch(nozle as any, { customerId: "cust_1" }, cutStream([data(chunk("hi")), data(usageChunk), "data: [DONE]\n\n"], "close") as any);
    await (await send(fetch)).text();

    await vi.waitFor(() => expect(nozle.track).toHaveBeenCalledTimes(1));
    const props = (nozle.track.mock.calls[0] as any[])[2];
    expect(props).toMatchObject({ usage_source: "reported", input_tokens: 9 });
    expect(props).not.toHaveProperty("stream_aborted");
  });
});
