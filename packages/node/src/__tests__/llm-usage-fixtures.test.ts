import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { captureProviderUsage, detectUsage, estimateTokens, requestTextBytes, StreamUsageCollector } from "../provider-usage";

// The shared contract of the LLM usage normalizers (the Engine, nozle-js, nozle-python and nozle-go read the same file).
const fixtures = JSON.parse(readFileSync(new URL("./contract/llm-usage-fixtures.json", import.meta.url), "utf8"));

const BREAKDOWNS = [
  "cached_input_tokens",
  "cache_write_tokens",
  "cache_write_1h_tokens",
  "reasoning_tokens",
  "audio_input_tokens",
  "audio_output_tokens",
  "image_input_tokens",
  "image_output_tokens",
];

async function sent(found: NonNullable<ReturnType<typeof detectUsage>>) {
  const nozle = {
    events: { createTransactionId: () => "txn" },
    track: vi.fn(() => Promise.resolve("txn")),
    costEvents: { track: vi.fn((_: any) => Promise.resolve({ status: "accepted" })) },
  };
  await captureProviderUsage({
    nozle: nozle as any,
    customerId: "c",
    featureCode: "f",
    costMeterCode: "m",
    provider: found.format,
    model: "m",
    requestId: "r",
    usage: found.usage,
    latencyMs: 0,
  });
  const props = (nozle.track.mock.calls[0] as any[])[2];
  const costs = Object.fromEntries(nozle.costEvents.track.mock.calls.map((c) => [c[0].properties.type, c[0].properties.tokens]));
  return { props, costs };
}

function expectUsage(props: any, costs: any, want: any) {
  expect(props.input_tokens).toBe(want.input_tokens);
  expect(props.output_tokens).toBe(want.output_tokens);
  for (const key of BREAKDOWNS) {
    if (key in want) expect(props[key], key).toBe(want[key]);
    else expect(props, key).not.toHaveProperty(key);
  }
  expect(props.service_tier).toBe(want.service_tier);
  expect(costs).toEqual(want.buckets);
}

describe("shared LLM usage fixtures", () => {
  it("estimates ceil(bytes / 4)", () => {
    for (const c of fixtures.estimator.cases) expect(estimateTokens(c.bytes)).toBe(c.tokens);
  });

  it("counts the request message text", () => {
    for (const c of fixtures.estimator.request_text) expect(requestTextBytes(c.body)).toBe(c.bytes);
  });

  for (const c of fixtures.usage) {
    it(`usage: ${c.name}`, async () => {
      const found = detectUsage(c.payload);
      if (!c.expect.found) return expect(found).toBeUndefined();
      expect(found!.format).toBe(c.expect.format);
      const { props, costs } = await sent(found!);
      expectUsage(props, costs, c.expect);
      expect(props.usage_source).toBe("reported");
    });
  }

  const feed = (sse: string) => {
    const collector = new StreamUsageCollector();
    for (const line of sse.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") collector.markFinished();
      else collector.add(JSON.parse(data));
    }
    return collector;
  };

  for (const c of fixtures.streams) {
    it(`stream: ${c.name}`, async () => {
      const collector = feed(c.sse);
      expect(collector.complete).toBe(c.complete);
      expect(collector.deliveredBytes).toBe(c.delivered_bytes);
      const found = collector.result();
      if (!c.expect.found) return expect(found).toBeUndefined();
      expect(found!.format).toBe(c.expect.format);
      const { props, costs } = await sent(found!);
      expectUsage(props, costs, c.expect);
    });
  }

  for (const c of fixtures.aborted) {
    it(`aborted: ${c.name}`, async () => {
      expect(requestTextBytes(c.request_body)).toBe(c.request_text_bytes);
      const collector = feed(c.sse);
      const found = collector.result(false, requestTextBytes(c.request_body));
      if (!c.expect.bill) return expect(found).toBeUndefined();
      expect(found!.format).toBe(c.expect.format);
      const { props, costs } = await sent(found!);
      expectUsage(props, costs, c.expect);
      expect(props.usage_source).toBe(c.expect.usage_source);
      // A stream cut after the provider's final usage already has its full usage: not aborted.
      expect(props.stream_aborted).toBe(collector.complete ? undefined : true);
    });
  }
});
