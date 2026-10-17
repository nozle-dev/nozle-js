import { describe, expect, it, vi } from "vitest";
import { captureFetch } from "../capture-fetch";
import { detectUsage } from "../provider-usage";

function tracker() {
  return {
    events: { createTransactionId: vi.fn(() => "txn_random") },
    track: vi.fn(() => Promise.resolve("txn")),
    costEvents: { track: vi.fn(() => Promise.resolve({ status: "accepted" })) },
  };
}

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

function sse(events: unknown[]): Response {
  const text = events.map((event) => `data: ${typeof event === "string" ? event : JSON.stringify(event)}\n\n`).join("");
  return new Response(text, { status: 200, headers: { "content-type": "text/event-stream" } });
}

describe("detectUsage recognises usage by response shape", () => {
  it("reads OpenAI-compatible chat usage", () => {
    expect(detectUsage({ id: "c1", model: "m", usage: { prompt_tokens: 10, completion_tokens: 5 } })).toMatchObject({
      format: "openai",
      id: "c1",
      usage: { featureInputTokens: 10, featureOutputTokens: 5 },
    });
  });

  it("reads OpenAI Responses API usage, which counts cached input inside input_tokens", () => {
    expect(
      detectUsage({ id: "r1", object: "response", usage: { input_tokens: 10, output_tokens: 4, input_tokens_details: { cached_tokens: 3 } } }),
    ).toMatchObject({
      format: "openai",
      usage: { featureInputTokens: 10, categories: [{ type: "input", tokens: 7 }, { type: "cached_input", tokens: 3 }, { type: "output", tokens: 4 }] },
    });
  });

  it("reads Anthropic usage, which counts cache reads outside input_tokens", () => {
    expect(
      detectUsage({ id: "msg_1", type: "message", usage: { input_tokens: 10, cache_read_input_tokens: 5, output_tokens: 2 } }),
    ).toMatchObject({ format: "anthropic", usage: { featureInputTokens: 15, featureOutputTokens: 2 } });
  });

  it("reads Gemini usageMetadata, counting thoughts as output", () => {
    expect(
      detectUsage({
        responseId: "g1",
        modelVersion: "gemini-x",
        usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 6, thoughtsTokenCount: 4, cachedContentTokenCount: 2 },
      }),
    ).toMatchObject({ format: "gemini", id: "g1", model: "gemini-x", usage: { featureInputTokens: 12, featureOutputTokens: 10 } });
  });

  it("ignores bodies without usage", () => {
    expect(detectUsage({ data: [] })).toBeUndefined();
    expect(detectUsage({ usage: { total: 3 } })).toBeUndefined();
  });
});

describe("captureFetch", () => {
  it("returns the provider response unchanged and records usage with a stable transaction id", async () => {
    const nozle = tracker();
    const body = { id: "chatcmpl-1", model: "gpt-x", usage: { prompt_tokens: 100, completion_tokens: 20 } };
    const provider = vi.fn(async () => json(body));
    const fetch = captureFetch(nozle as any, { customerId: "cust_1", featureCode: "ai_calls" }, provider as any);

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({ model: "gpt-x", messages: [] }),
    });

    expect(await response.json()).toEqual(body);
    await vi.waitFor(() => expect(nozle.track).toHaveBeenCalledTimes(1));
    expect(nozle.track).toHaveBeenCalledWith(
      "cust_1",
      "ai_calls",
      expect.objectContaining({ provider: "openai", provider_host: "api.groq.com", model: "gpt-x", input_tokens: 100, output_tokens: 20 }),
      expect.objectContaining({ transactionId: "llm-openai-chatcmpl-1" }),
    );
  });

  it("takes the customer from the request header and does not send Nozle headers to the provider", async () => {
    const nozle = tracker();
    const provider = vi.fn(async (_input: unknown, _init?: RequestInit) =>
      json({ id: "msg_1", type: "message", usage: { input_tokens: 3, output_tokens: 1 } }),
    );
    const fetch = captureFetch(nozle as any, { customerId: () => "fallback" }, provider as any);

    await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-nozle-customer-id": "cust_header", "X-Nozle-Feature": "chat", "x-api-key": "k" },
      body: "{}",
    });

    const sent = new Headers(provider.mock.calls[0][1]?.headers);
    expect(sent.get("x-nozle-customer-id")).toBeNull();
    expect(sent.get("x-nozle-feature")).toBeNull();
    expect(sent.get("x-api-key")).toBe("k");
    await vi.waitFor(() => expect(nozle.track).toHaveBeenCalled());
    expect(nozle.track).toHaveBeenCalledWith("cust_header", "llm_tokens", expect.objectContaining({ feature: "chat", provider: "anthropic" }), expect.anything());
  });

  it("asks chat streams for usage and records it from the last chunk while the app reads the stream", async () => {
    const nozle = tracker();
    const provider = vi.fn(async () =>
      sse([
        { id: "c2", model: "m", choices: [{ delta: { content: "Hi" } }], usage: null },
        { id: "c2", model: "m", choices: [], usage: { prompt_tokens: 8, completion_tokens: 2 } },
        "[DONE]",
      ]),
    );
    const fetch = captureFetch(nozle as any, { customerId: "cust_1" }, provider as any);

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({ model: "m", messages: [], stream: true }),
    });
    const sentBody = JSON.parse((provider.mock.calls[0] as any)[1].body);
    expect(sentBody.stream_options).toEqual({ include_usage: true });
    expect(await response.text()).toContain('"content":"Hi"');

    await vi.waitFor(() => expect(nozle.track).toHaveBeenCalled());
    expect(nozle.track).toHaveBeenCalledWith("cust_1", "llm_tokens", expect.objectContaining({ input_tokens: 8, output_tokens: 2 }), expect.objectContaining({ transactionId: "llm-openai-c2" }));
  });

  it("folds an Anthropic stream into the final usage", async () => {
    const nozle = tracker();
    const provider = vi.fn(async () =>
      sse([
        { type: "message_start", message: { id: "msg_2", model: "claude", usage: { input_tokens: 20, output_tokens: 1 } } },
        { type: "content_block_delta", delta: { text: "x" } },
        { type: "message_delta", delta: {}, usage: { output_tokens: 15 } },
        { type: "message_stop" },
      ]),
    );
    const fetch = captureFetch(nozle as any, { customerId: "cust_1" }, provider as any);
    const response = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", body: JSON.stringify({ stream: true }) });
    await response.text();

    await vi.waitFor(() => expect(nozle.track).toHaveBeenCalled());
    expect(nozle.track).toHaveBeenCalledWith("cust_1", "llm_tokens", expect.objectContaining({ provider: "anthropic", model: "claude", input_tokens: 20, output_tokens: 15 }), expect.anything());
  });

  it("does not change a request or record anything without a customer, and never fails the call when recording fails", async () => {
    const nozle = tracker();
    nozle.track.mockImplementation(() => Promise.reject(new Error("nozle down")));
    const onError = vi.fn();
    const provider = vi.fn(async () => json({ id: "c3", usage: { prompt_tokens: 1, completion_tokens: 1 } }));

    const anonymous = captureFetch(nozle as any, {}, provider as any);
    const init = { method: "POST", body: JSON.stringify({ messages: [], stream: true }) };
    await anonymous("https://api.openai.com/v1/chat/completions", init);
    expect((provider.mock.calls[0] as any)[1]).toBe(init);
    expect(nozle.track).not.toHaveBeenCalled();

    const named = captureFetch(nozle as any, { customerId: "cust_1", onError }, provider as any);
    const response = await named("https://api.openai.com/v1/chat/completions", { method: "POST", body: "{}" });
    expect(response.ok).toBe(true);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "nozle down" })));
  });

  it("passes failed provider responses through without reading them", async () => {
    const nozle = tracker();
    const provider = vi.fn(async () => new Response("rate limited", { status: 429 }));
    const fetch = captureFetch(nozle as any, { customerId: "cust_1" }, provider as any);
    const response = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", body: "{}" });
    expect(response.status).toBe(429);
    expect(await response.text()).toBe("rate limited");
    expect(nozle.track).not.toHaveBeenCalled();
  });
});

describe("recordUsage", () => {
  it("splits totals into categories and rejects when the usage event fails", async () => {
    const { recordUsage } = await import("../provider-usage");
    const nozle = tracker();
    await recordUsage(nozle as any, {
      customerId: "cust_1",
      model: "m",
      provider: "openai",
      requestId: "r9",
      inputTokens: 100,
      cachedInputTokens: 30,
      outputTokens: 50,
      reasoningTokens: 20,
      costMeterCode: "ai_tokens",
    });
    expect(nozle.track).toHaveBeenCalledWith("cust_1", "llm_tokens", expect.objectContaining({ input_tokens: 100, output_tokens: 50 }), expect.objectContaining({ transactionId: "llm-openai-r9" }));
    expect(nozle.costEvents.track.mock.calls.map((call: any) => [call[0].operationKey, call[0].properties.tokens])).toEqual([
      ["input", 70],
      ["cached_input", 30],
      ["output", 30],
      ["reasoning", 20],
    ]);

    nozle.track.mockImplementation(() => Promise.reject(new Error("down")));
    await expect(recordUsage(nozle as any, { customerId: "c", model: "m", inputTokens: 1, outputTokens: 1 })).rejects.toThrow("down");
  });
});

describe("missing Feature check", () => {
  it("reports once per client and code when no Feature has the event code, and still records", async () => {
    const nozle = { ...tracker(), eventsUrl: "https://core.example", apiKey: "sk_test" };
    const lookups = vi.fn(async () => new Response("{}", { status: 404 }));
    vi.stubGlobal("fetch", lookups);
    const onError = vi.fn();
    const provider = vi.fn(async () => json({ id: `c-${Math.random()}`, usage: { prompt_tokens: 1, completion_tokens: 1 } }));
    const fetch = captureFetch(nozle as any, { customerId: "cust_1", featureCode: "llm_tokens", onError }, provider as any);

    await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", body: "{}" });
    await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", body: "{}" });

    await vi.waitFor(() => expect(nozle.track).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError.mock.calls[0][0]).toMatchObject({ code: "feature_not_found" });
    expect(lookups).toHaveBeenCalledTimes(1);
    expect(String((lookups.mock.calls[0] as any)[0])).toBe("https://core.example/api/v1/features/llm_tokens");
    vi.unstubAllGlobals();
  });

  it("stays silent when the Feature exists or the check cannot run", async () => {
    for (const status of [200, 403, 500]) {
      const nozle = { ...tracker(), eventsUrl: "https://core.example", apiKey: "sk_test" };
      vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status })));
      const onError = vi.fn();
      const provider = vi.fn(async () => json({ id: "c", usage: { prompt_tokens: 1, completion_tokens: 1 } }));
      await captureFetch(nozle as any, { customerId: "c", onError }, provider as any)("https://x/v1/chat/completions", { method: "POST", body: "{}" });
      await vi.waitFor(() => expect(nozle.track).toHaveBeenCalled());
      await new Promise((r) => setTimeout(r, 20));
      expect(onError).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    }
  });
});
