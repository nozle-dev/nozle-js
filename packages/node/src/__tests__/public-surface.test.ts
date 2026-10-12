import { afterEach, describe, expect, it, vi } from "vitest";
import { Nozle, wrapAnthropic } from "../index";

afterEach(() => vi.unstubAllGlobals());

describe("public Node methods omitted from the original suite", () => {
  it("preserves live response contracts for ping, wallet deduction, and margin groupings", async () => {
    const request = vi
      .fn()
      .mockImplementation(async (input: string, options?: RequestInit) => {
        const u = new URL(input);
        if (u.pathname.endsWith("/ping"))
          return new Response(JSON.stringify({ ok: true }));
        if (u.pathname.endsWith("/check-and-deduct")) {
          expect(JSON.parse(String(options?.body))).toEqual({
            customer_id: "customer",
            feature: "requests",
            credits: 1,
          });
          return new Response(JSON.stringify({ allowed: true, remaining: 9 }));
        }
        expect(u.searchParams.get("customer_id")).toBe("customer");
        return new Response(JSON.stringify({ data: [] }));
      });
    vi.stubGlobal("fetch", request);
    const client = new Nozle({ apiKey: "sk_test" });
    expect((await client.ping()).ok).toBe(true);
    expect(
      (
        await client.checkAndDeduct({
          customerId: "customer",
          feature: "requests",
          credits: 1,
        })
      ).remaining,
    ).toBe(9);
    for (const method of ["byMetric", "byPlan", "byModel"] as const)
      expect(await client.margin[method]({ customer_id: "customer" })).toEqual({
        data: [],
      });
    expect(request.mock.calls.map((c) => new URL(c[0]).pathname)).toEqual([
      "/engine/api/v1/ping",
      "/engine/api/v1/check-and-deduct",
      "/engine/api/v1/margin/metrics",
      "/engine/api/v1/margin/plans",
      "/engine/api/v1/margin/models",
    ]);
  });
  it("preserves streamed Anthropic chunks and merges input, cache, and final output usage", async () => {
    const chunks = [
      {
        type: "message_start",
        message: {
          id: "msg-test",
          model: "model",
          usage: {
            input_tokens: 5,
            cache_read_input_tokens: 3,
            cache_creation_input_tokens: 2,
          },
        },
      },
      { type: "content_block_delta", delta: { text: "hello" } },
      { type: "message_delta", usage: { output_tokens: 7 } },
    ];
    const source = {
      messages: {
        create: vi.fn(async (_params: Record<string, unknown>) =>
          (async function* () {
            yield* chunks;
          })(),
        ),
      },
    };
    const client = new Nozle({ apiKey: "sk_test" });
    const track = vi.spyOn(client, "track").mockResolvedValue("event");
    const costs = vi
      .spyOn(client.costEvents, "track")
      .mockResolvedValue({ status: "accepted", cost_event_id: "cost" });
    const wrapped = wrapAnthropic(source, client, {
      customerId: "customer",
      metricCode: "tokens",
      costMeterCode: "provider-cost",
    });
    const seen = [];
    for await (const part of await wrapped.messages.create({
      stream: true,
      model: "model",
    }))
      seen.push(part);
    expect(seen).toEqual(chunks);
    expect(track).toHaveBeenCalledWith(
      "customer",
      "tokens",
      expect.objectContaining({ input_tokens: 10, output_tokens: 7 }),
      expect.any(Object),
    );
    expect(
      costs.mock.calls.map(([p]) => [p.operationKey, p.properties?.tokens]),
    ).toEqual([
      ["input", 5],
      ["cached_input", 3],
      ["cache_write", 2],
      ["output", 7],
    ]);
  });
});
