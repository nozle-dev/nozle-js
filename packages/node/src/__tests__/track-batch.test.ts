import { gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Nozle, NozleApiError, NozleValidationError, type TrackBatchEvent } from "../index";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
afterEach(() => fetchMock.mockReset());

const client = (config: { maxRetries?: number } = {}) => new Nozle({ apiKey: "sk_test", retryDelayMs: 1, ...config });
const events = (n: number): TrackBatchEvent[] =>
  Array.from({ length: n }, (_, i) => ({ customerId: "c1", event: "api_call", metadata: { i }, transactionId: `tx-${i}` }));
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, statusText: "X", headers: { "content-type": "application/json" } });
const decode = (init: RequestInit) => JSON.parse(gunzipSync(init.body as Uint8Array).toString());
const sent = (call: number): Array<Record<string, unknown>> => decode(fetchMock.mock.calls[call][1]).events;
const sentIds = (call: number) => sent(call).map((e) => e.transaction_id);

describe("trackBatch", () => {
  it("sends nothing for an empty list", async () => {
    const result = await client().trackBatch([]);
    expect(result).toEqual({ total: 0, accepted: 0, rejected: 0, failed: 0, results: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [1, [1]],
    [5000, [5000]],
    [5001, [5000, 1]],
    [12000, [5000, 5000, 2000]],
  ])("chunks %i events into requests of %j", async (count, sizes) => {
    fetchMock.mockImplementation(async () => json(200, { events: [] }));
    const result = await client().trackBatch(events(count));
    expect(fetchMock.mock.calls.map((_, call) => sent(call).length).sort((a, b) => b - a)).toEqual(sizes);
    expect(fetchMock.mock.calls.every((call) => String(call[0]).endsWith("/engine/api/v1/events/batch"))).toBe(true);
    expect(result).toMatchObject({ total: count, accepted: count, rejected: 0, failed: 0 });
    expect(result.results.map((r) => r.index)).toEqual(Array.from({ length: count }, (_, i) => i));
  });

  it("maps each event to the body of track(): own timestamp, subscription, generated transaction id", async () => {
    fetchMock.mockResolvedValue(json(200, { events: [] }));
    const result = await client().trackBatch([
      { customerId: "c1", event: "a", subscriptionId: "s1", timestamp: "2026-01-02T03:04:05Z", metadata: { n: 1 } },
      { customerId: "c2", event: "b" },
    ]);
    const [first, second] = sent(0);
    expect(first).toMatchObject({ external_customer_id: "c1", code: "a", external_subscription_id: "s1", timestamp: "1767323045.000", properties: { n: 1 } });
    expect(second).not.toHaveProperty("timestamp");
    expect(second).not.toHaveProperty("external_subscription_id");
    expect(result.results.map((r) => r.transactionId)).toEqual(sentIds(0));
    expect(new Set(sentIds(0)).size).toBe(2);
  });

  it("honours chunkSize and rejects a value above the Engine maximum", async () => {
    fetchMock.mockImplementation(async () => json(200, { events: [] }));
    await client().trackBatch(events(100), { chunkSize: 40 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const chunkSize of [0, 5001, 1.5]) await expect(client().trackBatch(events(1), { chunkSize })).rejects.toBeInstanceOf(NozleValidationError);
    await expect(client().trackBatch(events(1), { concurrency: 0 })).rejects.toBeInstanceOf(NozleValidationError);
  });

  it("never has more requests in flight than concurrency", async () => {
    let active = 0;
    let peak = 0;
    fetchMock.mockImplementation(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return json(200, { events: [] });
    });
    await client().trackBatch(events(10), { chunkSize: 1, concurrency: 3 });
    expect(fetchMock).toHaveBeenCalledTimes(10);
    expect(peak).toBe(3);
  });

  it("a 422 naming bad events rejects them by input index and resends the rest once", async () => {
    fetchMock
      .mockResolvedValueOnce(json(422, { status: 422, error: "Unprocessable Entity", code: "validation_errors", error_details: { "1": { code: ["value_is_mandatory"] } } }))
      .mockResolvedValueOnce(json(200, { events: [] }));
    const result = await client().trackBatch(events(3));
    expect(sentIds(0)).toEqual(["tx-0", "tx-1", "tx-2"]);
    expect(sentIds(1)).toEqual(["tx-0", "tx-2"]);
    expect(result).toMatchObject({ total: 3, accepted: 2, rejected: 1, failed: 0 });
    expect(result.results[1]).toEqual({ index: 1, transactionId: "tx-1", status: "rejected", errors: { code: ["value_is_mandatory"] } });
    expect(result.results.map((r) => r.status)).toEqual(["accepted", "rejected", "accepted"]);
  });

  it("reports the position in the whole input, not in the chunk", async () => {
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const ids = decode(init).events.map((e: { transaction_id: string }) => e.transaction_id);
      const bad = ids.indexOf("tx-103");
      return bad >= 0
        ? json(422, { code: "validation_errors", error_details: { [bad]: { transaction_id: ["value_already_exist"] } } })
        : json(200, { events: [] });
    });
    const result = await client().trackBatch(events(150));
    expect(result.results[103]).toMatchObject({ status: "rejected", errors: { transaction_id: ["value_already_exist"] } });
    expect(result).toMatchObject({ accepted: 149, rejected: 1, failed: 0 });
  });

  it("a 200 listing overdue-payment refusals marks those events rejected", async () => {
    fetchMock.mockResolvedValue(json(200, { events: [], error_details: { "2": { external_customer_id: ["customer_payment_overdue"] } } }));
    const result = await client().trackBatch(events(3));
    expect(result.results[2]).toMatchObject({ status: "rejected", errors: { external_customer_id: ["customer_payment_overdue"] } });
    expect(result).toMatchObject({ accepted: 2, rejected: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a 402 refusing every event rejects them all without a resend", async () => {
    fetchMock.mockResolvedValue(json(402, { code: "customer_payment_overdue", error_details: { "0": { external_customer_id: ["customer_payment_overdue"] }, "1": { external_customer_id: ["customer_payment_overdue"] } } }));
    const result = await client().trackBatch(events(2));
    expect(result).toMatchObject({ accepted: 0, rejected: 2, failed: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a failed request with the same transaction ids", async () => {
    fetchMock.mockResolvedValueOnce(json(503, {})).mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce(json(200, { events: [] }));
    const batch: TrackBatchEvent[] = [{ customerId: "c1", event: "a" }, { customerId: "c1", event: "a" }];
    const result = await client({ maxRetries: 2 }).trackBatch(batch);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sentIds(1)).toEqual(sentIds(0));
    expect(sentIds(2)).toEqual(sentIds(0));
    expect(result.results.map((r) => r.transactionId)).toEqual(sentIds(0));
    expect(result.accepted).toBe(2);
  });

  it("a failed chunk does not lose the others and does not throw", async () => {
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const ids: string[] = decode(init).events.map((e: { transaction_id: string }) => e.transaction_id);
      return ids.includes("tx-100") ? json(500, { error: "boom" }) : json(200, { events: [] });
    });
    const result = await client({ maxRetries: 0 }).trackBatch(events(250), { chunkSize: 100 });
    expect(result).toMatchObject({ total: 250, accepted: 150, rejected: 0, failed: 100 });
    const failed = result.results.filter((r) => r.status === "failed");
    expect(failed.map((r) => r.index)).toEqual(Array.from({ length: 100 }, (_, i) => 100 + i));
    expect(failed.every((r) => r.status === "failed" && r.error instanceof NozleApiError && r.error.status === 500)).toBe(true);
  });

  it("a network error marks the chunk failed with the transaction ids to resend", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const result = await client({ maxRetries: 0 }).trackBatch(events(2));
    expect(result).toMatchObject({ accepted: 0, failed: 2 });
    expect(result.results[0]).toMatchObject({ transactionId: "tx-0", status: "failed" });
  });

  it("gzips the request body", async () => {
    fetchMock.mockResolvedValue(json(200, { events: [] }));
    await client().trackBatch(events(3));
    const init: RequestInit = fetchMock.mock.calls[0][1];
    expect(new Headers(init.headers).get("content-encoding")).toBe("gzip");
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
    expect(decode(init).events.map((e: { transaction_id: string }) => e.transaction_id)).toEqual(["tx-0", "tx-1", "tx-2"]);
  });

  it("a 200 listing refused events stores the others without a resend", async () => {
    fetchMock.mockResolvedValue(json(200, { events: [{}, {}], error_details: { "1": { external_customer_id: ["active_subscription_not_found"] } } }));
    const result = await client().trackBatch(events(3));
    expect(result.results.map((r) => r.status)).toEqual(["accepted", "rejected", "accepted"]);
    expect(result.results[1]).toMatchObject({ errors: { external_customer_id: ["active_subscription_not_found"] } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends a request refused as too_many_events again in halves until each fits", async () => {
    // An Engine capped at 100, as before 2.28.0.
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) =>
      decode(init).events.length > 100
        ? json(422, { code: "validation_errors", error_details: { events: ["too_many_events"] } })
        : json(200, { events: [] }));
    const result = await client().trackBatch(events(300));
    expect(result).toMatchObject({ total: 300, accepted: 300, rejected: 0, failed: 0 });
    const stored = fetchMock.mock.calls.map((_, call) => sent(call)).filter((batch) => batch.length <= 100);
    expect(stored.flat().map((e) => e.transaction_id)).toEqual(Array.from({ length: 300 }, (_, i) => `tx-${i}`));
    expect(stored.map((batch) => batch.length)).toEqual([75, 75, 75, 75]);
  });

  it("a 422 without positions fails the whole chunk instead of resending", async () => {
    fetchMock.mockResolvedValue(json(422, { code: "validation_errors", error_details: { events: ["no_events"] } }));
    const result = await client().trackBatch(events(2));
    expect(result).toMatchObject({ rejected: 0, failed: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops resending after three rounds", async () => {
    let round = 0;
    fetchMock.mockImplementation(async () => json(422, { error_details: { "0": { code: [`r${round++}`] } } }));
    const result = await client().trackBatch(events(5));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ rejected: 3, failed: 2 });
  });

  it("rejects invalid input before any request", async () => {
    const bad: Array<[TrackBatchEvent[], number]> = [
      [[...events(1), { customerId: "", event: "a" }], 1],
      [[{ customerId: "c", event: " " }], 0],
      [[{ customerId: "c", event: "a", timestamp: "yesterday" }], 0],
      [[{ customerId: "c", event: "a", transactionId: "same" }, { customerId: "c", event: "a", transactionId: "same" }], 1],
      [[null as unknown as TrackBatchEvent], 0],
    ];
    for (const [batch, index] of bad) {
      const error = await client().trackBatch(batch).catch((cause: unknown) => cause);
      expect(error).toBeInstanceOf(NozleValidationError);
      expect((error as NozleValidationError).index).toBe(index);
    }
    await expect(client().trackBatch("x" as unknown as TrackBatchEvent[])).rejects.toBeInstanceOf(NozleValidationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
