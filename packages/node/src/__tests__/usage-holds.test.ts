import { afterEach, describe, expect, it, vi } from "vitest";
import { Nozle, NozleApiError } from "../index";

const hold = {
  hold_id: "hold_1",
  status: "held",
  customer_id: "acme",
  feature_code: "agent_execution",
  credit_system: "ai_credits",
  metric_amount: "1000",
  credits_required: "2",
  credits_held: "2",
  expires_at: "2026-10-31T12:15:00Z",
  created_at: "2026-10-31T12:00:00Z",
  resolved_at: null,
};

type Handler = (init: RequestInit, url: URL) => Response;
function stub(routes: Record<string, Handler>) {
  const fetch = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const route = routes[`${init.method ?? "GET"} ${url.pathname}`];
    if (!route) throw new Error(`unexpected ${init.method ?? "GET"} ${url}`);
    return route(init, url);
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
const body = (call: unknown[]) => JSON.parse(String((call[1] as RequestInit).body));
const headers = (call: unknown[]) => (call[1] as RequestInit).headers as Record<string, string>;
const nozle = (apiKey = "sk_test") => new Nozle({ apiKey, host: "https://api.example", maxRetries: 2, retryDelayMs: 1 });
const engine = "/engine/api/v1";
const failure = (status: number, code: string) =>
  new Response(JSON.stringify({ code, error: code }), { status, statusText: "Err", headers: { "content-type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("usage.holds", () => {
  it("creates a hold with the track body, ttl_seconds and the Idempotency-Key", async () => {
    const fetch = stub({ [`POST ${engine}/usage/holds`]: () => Response.json({ ...hold, allowed: true, available: "98" }) });
    const result = await nozle().usage.holds.create(
      {
        customerId: "acme",
        entityId: "user/42",
        featureCode: "agent_execution",
        creditSystemCode: "ai_credits",
        properties: { tokens: 1000 },
        timestamp: "2026-10-31T12:00:00.500Z",
        ttlSeconds: 600,
      },
      { idempotencyKey: "run-1" },
    );
    expect(result).toMatchObject({ hold_id: "hold_1", allowed: true, credits_held: "2", available: "98" });
    expect(headers(fetch.mock.calls[0])["Idempotency-Key"]).toBe("run-1");
    expect(body(fetch.mock.calls[0])).toEqual({
      customer_id: "acme",
      entity_id: "user/42",
      feature_code: "agent_execution",
      credit_system_code: "ai_credits",
      properties: { tokens: 1000 },
      timestamp: "2026-10-31T12:00:00.500Z",
      ttl_seconds: 600,
    });
  });

  it("returns a denial (allowed false) instead of throwing", async () => {
    stub({
      [`POST ${engine}/usage/holds`]: () =>
        Response.json({ ...hold, status: "denied", credits_held: "0", allowed: false, reason: "insufficient_credits", available: "1" }),
    });
    const result = await nozle().usage.holds.create({ customerId: "acme", featureCode: "agent_execution" }, { idempotencyKey: "run-2" });
    expect(result).toMatchObject({ allowed: false, reason: "insufficient_credits", status: "denied" });
  });

  it("reuses the generated timestamp for a retried create key and a retried finalize", async () => {
    vi.useFakeTimers();
    const fetch = stub({
      [`POST ${engine}/usage/holds`]: () => Response.json({ ...hold, allowed: true, available: "1" }),
      [`POST ${engine}/usage/holds/hold_1/finalize`]: () => Response.json({ allowed: true, hold_id: "hold_1" }),
    });
    const client = nozle();
    const params = { customerId: "acme", featureCode: "agent_execution" };
    vi.setSystemTime(new Date("2026-10-31T10:00:00.000Z"));
    await client.usage.holds.create(params, { idempotencyKey: "k1" });
    await client.usage.holds.finalize("hold_1", { properties: { tokens: 5 } });
    vi.setSystemTime(new Date("2026-10-31T10:00:05.000Z"));
    await client.usage.holds.create(params, { idempotencyKey: "k1" });
    await client.usage.holds.finalize("hold_1", { properties: { tokens: 5 } });
    await client.usage.holds.create(params, { idempotencyKey: "k2" });

    expect(fetch.mock.calls.map((call) => body(call).timestamp)).toEqual([
      "2026-10-31T10:00:00.000Z",
      "2026-10-31T10:00:00.000Z",
      "2026-10-31T10:00:00.000Z",
      "2026-10-31T10:00:00.000Z",
      "2026-10-31T10:00:05.000Z",
    ]);
  });

  it("validates before any request", async () => {
    const fetch = stub({});
    const client = nozle();
    const params = { customerId: "acme", featureCode: "agent_execution" };
    await expect(client.usage.holds.create(params, { idempotencyKey: "" })).rejects.toThrow("non-empty idempotencyKey");
    await expect(client.usage.holds.create(params, { idempotencyKey: "x".repeat(256) })).rejects.toThrow("255 bytes");
    for (const ttlSeconds of [0, 86401, 1.5]) {
      await expect(client.usage.holds.create({ ...params, ttlSeconds }, { idempotencyKey: "k" })).rejects.toThrow("ttlSeconds");
    }
    await expect(client.usage.holds.create({ ...params, customerId: "" }, { idempotencyKey: "k" })).rejects.toThrow("customerId");
    await expect(client.usage.holds.finalize(" ")).rejects.toThrow("holdId");
    await expect(client.usage.holds.get("")).rejects.toThrow("holdId");
    await expect(client.usage.holds.list("")).rejects.toThrow("customerId");
    await expect(client.usage.holds.list("acme", { status: "open" as never })).rejects.toThrow("status must be one of");
    await expect(nozle("pk_browser").usage.holds.create(params, { idempotencyKey: "k" })).rejects.toThrow("secret key");
    await expect(nozle("pk_browser").usage.holds.finalize("hold_1")).rejects.toThrow("secret key");
    await expect(nozle("pk_browser").usage.holds.release("hold_1")).rejects.toThrow("secret key");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("finalizes with {properties, timestamp} and retries it (Engine replays the same usage)", async () => {
    let n = 0;
    const fetch = stub({
      [`POST ${engine}/usage/holds/hold%2F1/finalize`]: () =>
        ++n < 2
          ? failure(503, "unavailable")
          : Response.json({
              allowed: true,
              operation_id: "op_1",
              credits_consumed: "1.5",
              hold_id: "hold/1",
              hold_status: "finalized",
              credits_held: "2",
              credits_released: "0.5",
              hold_expired: false,
            }),
    });
    const result = await nozle().usage.holds.finalize("hold/1", { properties: { tokens: 750 }, timestamp: "2026-10-31T12:01:00Z" });
    expect(result).toMatchObject({ hold_status: "finalized", credits_released: "0.5", hold_expired: false });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(body(fetch.mock.calls[0])).toEqual({ properties: { tokens: 750 }, timestamp: "2026-10-31T12:01:00Z" });
    expect(body(fetch.mock.calls[1])).toEqual(body(fetch.mock.calls[0]));
  });

  it("releases, gets and lists holds", async () => {
    const fetch = stub({
      [`POST ${engine}/usage/holds/hold_1/release`]: () => Response.json({ ...hold, status: "released" }),
      [`GET ${engine}/usage/holds/hold_1`]: () => Response.json(hold),
      [`GET ${engine}/customers/acme%2Fwest/credit-holds`]: (_init, url) =>
        Response.json({ customer_id: "acme/west", holds: url.searchParams.get("status") === "held" ? [hold] : [] }),
    });
    const client = nozle();
    expect((await client.usage.holds.release("hold_1")).status).toBe("released");
    expect((fetch.mock.calls[0][1] as RequestInit).body).toBeUndefined();
    expect((await client.usage.holds.get("hold_1")).hold_id).toBe("hold_1");
    expect((await client.usage.holds.list("acme/west", { status: "held" })).holds).toHaveLength(1);
    expect((await client.usage.holds.list("acme/west")).holds).toHaveLength(0);
    expect(new URL(String(fetch.mock.calls[3][0])).search).toBe("");
  });

  it("throws NozleApiError with Engine's hold codes", async () => {
    stub({
      [`POST ${engine}/usage/holds/hold_1/release`]: () => failure(409, "hold_already_resolved"),
      [`GET ${engine}/usage/holds/missing`]: () => failure(404, "hold_not_found"),
      [`POST ${engine}/usage/holds`]: () => failure(400, "hold_ttl_invalid"),
    });
    const client = nozle();
    const codeOf = (promise: Promise<unknown>) => promise.then(() => undefined, (error: NozleApiError) => [error.status, error.code]);
    expect(await codeOf(client.usage.holds.release("hold_1"))).toEqual([409, "hold_already_resolved"]);
    expect(await codeOf(client.usage.holds.get("missing"))).toEqual([404, "hold_not_found"]);
    expect(await codeOf(client.usage.holds.create({ customerId: "a", featureCode: "f" }, { idempotencyKey: "k" }))).toEqual([400, "hold_ttl_invalid"]);
  });
});
