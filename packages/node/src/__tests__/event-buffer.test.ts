import { gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventBufferError, Nozle, NozleValidationError, type EventBufferOptions, type TrackBatchEvent } from "../index";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
afterEach(() => {
  fetchMock.mockReset();
  vi.restoreAllMocks();
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, statusText: "X", headers: { "content-type": "application/json" } });
const ok = () => json(200, { events: [] });
const sentIds = (call: number): string[] =>
  JSON.parse(gunzipSync(fetchMock.mock.calls[call][1].body as Uint8Array).toString()).events.map((e: { transaction_id: string }) => e.transaction_id);
const allSentIds = () => fetchMock.mock.calls.flatMap((_, call) => sentIds(call));

function buffer(options: EventBufferOptions = {}) {
  const onError = vi.fn<(error: EventBufferError, events: TrackBatchEvent[]) => void>();
  const buf = new Nozle({ apiKey: "sk_test", retryDelayMs: 1, maxRetries: 0 }).createEventBuffer({ flushIntervalMs: 0, onError, ...options });
  return { buf, onError };
}
const event = (i: number): TrackBatchEvent => ({ customerId: "c1", event: "api_call", metadata: { i } });

describe("createEventBuffer", () => {
  it("returns a transaction id at once, sends nothing until a flush, and keeps a given id", async () => {
    fetchMock.mockImplementation(async () => ok());
    const { buf } = buffer();
    const generated = buf.track(event(0));
    expect(buf.track({ ...event(1), transactionId: "tx-mine" })).toBe("tx-mine");
    expect(generated).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(buf.size).toBe(2);
    expect(fetchMock).not.toHaveBeenCalled();
    await buf.flush();
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/engine\/api\/v1\/events\/batch$/);
    expect(sentIds(0)).toEqual([generated, "tx-mine"]);
    expect(buf.size).toBe(0);
    await buf.close();
  });

  it("validates options and events before queueing", () => {
    const nozle = new Nozle({ apiKey: "sk_test" });
    for (const options of [{ maxBatchSize: 0 }, { maxBatchSize: 5001 }, { maxQueueSize: 0 }, { maxAttempts: 1.5 }, { flushIntervalMs: -1 }])
      expect(() => nozle.createEventBuffer(options)).toThrow(NozleValidationError);
    const { buf } = buffer();
    expect(() => buf.track({ customerId: "", event: "x" })).toThrow(NozleValidationError);
    expect(() => buf.track({ customerId: "c1", event: "x", timestamp: "yesterday" })).toThrow(NozleValidationError);
    expect(buf.size).toBe(0);
    void buf.close();
  });

  it("starts a flush as soon as maxBatchSize events are waiting", async () => {
    fetchMock.mockImplementation(async () => ok());
    const { buf } = buffer({ maxBatchSize: 3 });
    buf.track(event(0));
    buf.track(event(1));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(fetchMock).not.toHaveBeenCalled();
    buf.track(event(2));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sentIds(0)).toHaveLength(3);
    await buf.close();
  });

  it("flushes on the timer", async () => {
    fetchMock.mockImplementation(async () => ok());
    const { buf } = buffer({ flushIntervalMs: 10 });
    const id = buf.track(event(0));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sentIds(0)).toEqual([id]);
    await buf.close();
  });

  it("runs one flush at a time: a size trigger during a flush waits for it", async () => {
    let release!: () => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve(ok())))).mockImplementation(async () => ok());
    const { buf } = buffer({ maxBatchSize: 2 });
    buf.track(event(0));
    buf.track(event(1));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    buf.track(event(2));
    buf.track(event(3));
    const flushed = buf.flush();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    release();
    await flushed;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentIds(1)).toHaveLength(2);
    await buf.close();
  });

  it("drops a new event when full and reports buffer_full; the default is a NozleTrackingWarning", async () => {
    const { buf, onError } = buffer({ maxQueueSize: 2 });
    buf.track(event(0));
    buf.track(event(1));
    const id = buf.track(event(2));
    expect(buf.size).toBe(2);
    expect(onError).toHaveBeenCalledTimes(1);
    const [error, events] = onError.mock.calls[0];
    expect(error).toBeInstanceOf(EventBufferError);
    expect(error.code).toBe("buffer_full");
    expect(events).toEqual([{ ...event(2), transactionId: id }]);

    const warn = vi.spyOn(process, "emitWarning").mockImplementation(() => {});
    const quiet = new Nozle({ apiKey: "sk_test" }).createEventBuffer({ maxQueueSize: 1, flushIntervalMs: 0 });
    quiet.track(event(0));
    quiet.track(event(1));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Nozle event buffer"), { type: "NozleTrackingWarning", code: "buffer_full" });
    fetchMock.mockImplementation(async () => ok());
    await Promise.all([buf.close(), quiet.close()]);
  });

  it("reports a rejected event once and never resends it", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { events: [], error_details: { "1": { code: ["value_is_mandatory"] } } })).mockImplementation(async () => ok());
    const { buf, onError } = buffer();
    buf.track(event(0));
    const bad = buf.track(event(1));
    await buf.flush();
    expect(onError).toHaveBeenCalledTimes(1);
    const [error, events] = onError.mock.calls[0];
    expect(error).toMatchObject({ code: "rejected", errors: { code: ["value_is_mandatory"] } });
    expect(events.map((e) => e.transactionId)).toEqual([bad]);
    expect(buf.size).toBe(0);
    await buf.flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await buf.close();
  });

  it("re-queues a failed event at the front with the same transaction id, then reports it after maxAttempts", async () => {
    fetchMock.mockImplementation(async () => json(500, { error: "boom" }));
    const { buf, onError } = buffer({ maxAttempts: 3 });
    const id = buf.track(event(0));
    await buf.flush();
    expect(buf.size).toBe(1);
    const later = buf.track(event(1));
    await buf.flush();
    expect(sentIds(1)).toEqual([id, later]);
    expect(onError).not.toHaveBeenCalled();
    await buf.flush();
    expect(allSentIds()).toEqual([id, id, later, id, later]);
    expect(onError).toHaveBeenCalledTimes(1);
    const [error, events] = onError.mock.calls[0];
    expect(error.code).toBe("failed");
    expect(error.cause).toBeDefined();
    expect(events.map((e) => e.transactionId)).toEqual([id]);
    expect(buf.size).toBe(1);
    await buf.close();
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError.mock.calls[1][1].map((e) => e.transactionId)).toEqual([later]);
    expect(buf.size).toBe(0);
  });

  it("close flushes, stops the timer and reports a later track as closed", async () => {
    fetchMock.mockImplementation(async () => ok());
    const { buf, onError } = buffer({ flushIntervalMs: 10 });
    const id = buf.track(event(0));
    await buf.close();
    expect(allSentIds()).toEqual([id]);
    const late = buf.track(event(1));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].code).toBe("closed");
    expect(onError.mock.calls[0][1][0].transactionId).toBe(late);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(buf.size).toBe(0);
  });

  it("sends a transaction id tracked twice in separate requests", async () => {
    fetchMock.mockImplementation(async () => ok());
    const { buf, onError } = buffer();
    buf.track({ ...event(0), transactionId: "tx-1" });
    buf.track({ ...event(1), transactionId: "tx-1" });
    await buf.close();
    expect(fetchMock.mock.calls.map((_, call) => sentIds(call))).toEqual([["tx-1"], ["tx-1"]]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("sends every event once when many producers track during flushes", async () => {
    fetchMock.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return ok();
    });
    const { buf, onError } = buffer({ maxBatchSize: 7, flushIntervalMs: 2 });
    const ids = (
      await Promise.all(
        Array.from({ length: 20 }, async (_, producer) => {
          const mine: string[] = [];
          for (let i = 0; i < 50; i += 1) {
            mine.push(buf.track(event(producer * 50 + i)));
            if (i % 5 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
          }
          return mine;
        }),
      )
    ).flat();
    await buf.close();
    const sent = allSentIds();
    expect(sent).toHaveLength(1000);
    expect(new Set(sent)).toEqual(new Set(ids));
    expect(onError).not.toHaveBeenCalled();
  });

  it("registers one beforeExit hook that flushes, and removes it on close", async () => {
    fetchMock.mockImplementation(async () => ok());
    const before = process.listenerCount("beforeExit");
    const { buf } = buffer();
    expect(process.listenerCount("beforeExit")).toBe(before + 1);
    const id = buf.track(event(0));
    process.emit("beforeExit", 0);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sentIds(0)).toEqual([id]);
    await buf.close();
    expect(process.listenerCount("beforeExit")).toBe(before);
  });
});
