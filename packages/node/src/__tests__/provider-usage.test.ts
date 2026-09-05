import { describe, expect, it, vi } from "vitest";
import { normalizeAnthropicUsage, normalizeOpenAIUsage } from "../provider-usage";
import { wrapAnthropic } from "../wrap-anthropic";
import { wrapOpenAI } from "../wrap-openai";

function tracker() {
  return {
    events: { createTransactionId: vi.fn(() => "txn_123") },
    track: vi.fn(() => Promise.resolve("txn_123")),
    costEvents: { track: vi.fn(() => Promise.resolve({ status: "accepted" })) },
  };
}

describe("provider token normalization", () => {
  it("splits OpenAI totals into mutually exclusive token categories", () => {
    expect(
      normalizeOpenAIUsage({
        prompt_tokens: 100,
        completion_tokens: 40,
        prompt_tokens_details: { cached_tokens: 25 },
        completion_tokens_details: { reasoning_tokens: 10 },
      }),
    ).toEqual({
      featureInputTokens: 100,
      featureOutputTokens: 40,
      categories: [
        { type: "input", tokens: 75 },
        { type: "cached_input", tokens: 25 },
        { type: "output", tokens: 30 },
        { type: "reasoning", tokens: 10 },
      ],
    });
  });

  it("normalizes Anthropic cache read and cache creation usage", () => {
    expect(
      normalizeAnthropicUsage({
        input_tokens: 70,
        cache_read_input_tokens: 20,
        cache_creation_input_tokens: 10,
        output_tokens: 15,
      }),
    ).toEqual({
      featureInputTokens: 100,
      featureOutputTokens: 15,
      categories: [
        { type: "input", tokens: 70 },
        { type: "cached_input", tokens: 20 },
        { type: "cache_write", tokens: 10 },
        { type: "output", tokens: 15 },
      ],
    });
  });
});

describe("provider wrappers", () => {
  it("links OpenAI token Cost Events to the generated Feature Event transaction", async () => {
    const nozle = tracker();
    const response = {
      id: "openai_request_1",
      model: "gpt-test",
      usage: {
        prompt_tokens: 100,
        completion_tokens: 20,
        prompt_tokens_details: { cached_tokens: 25 },
      },
    };
    const provider = {
      chat: { completions: { create: vi.fn(async () => response) } },
    };

    wrapOpenAI(provider, nozle as any, {
      customerId: "customer_1",
      metricCode: "copilot_action",
      costMeterCode: "ai_tokens",
    });
    expect(await provider.chat.completions.create()).toBe(response);

    await vi.waitFor(() => expect(nozle.costEvents.track).toHaveBeenCalledTimes(3));
    expect(nozle.track).toHaveBeenCalledWith(
      "customer_1",
      "copilot_action",
      expect.objectContaining({ provider: "openai", input_tokens: 100, output_tokens: 20 }),
      expect.objectContaining({ transactionId: "txn_123" }),
    );
    expect(nozle.costEvents.track).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        parentTransactionId: "txn_123",
        requestId: "openai_request_1",
        operationKey: "input",
        properties: {
          tokens: 75,
          provider: "openai",
          model: "gpt-test",
          type: "input",
        },
      }),
    );
  });

  it("captures Anthropic cached tokens without changing the provider response", async () => {
    const nozle = tracker();
    const response = {
      id: "anthropic_request_1",
      model: "claude-test",
      usage: {
        input_tokens: 50,
        cache_read_input_tokens: 30,
        cache_creation_input_tokens: 20,
        output_tokens: 10,
      },
    };
    const provider = { messages: { create: vi.fn(async () => response) } };

    wrapAnthropic(provider, nozle as any, {
      customerId: "customer_1",
      costMeterCode: "ai_tokens",
    });
    expect(await provider.messages.create()).toBe(response);

    await vi.waitFor(() => expect(nozle.costEvents.track).toHaveBeenCalledTimes(4));
    expect(nozle.costEvents.track).toHaveBeenCalledWith(
      expect.objectContaining({
        operationKey: "cache_write",
        properties: expect.objectContaining({ type: "cache_write", tokens: 20 }),
      }),
    );
  });
});
