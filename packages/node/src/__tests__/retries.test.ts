import { afterEach, describe, expect, it, vi } from "vitest";
import { Nozle } from "../client";
import { NozleApiError } from "../errors";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
afterEach(() => fetchMock.mockReset());

const ok = () => new Response(JSON.stringify({ plans: [] }), { status: 200 });
const fail = (status: number, headers: Record<string, string> = {}) =>
  new Response("{}", { status, statusText: "Failure", headers });
const client = (maxRetries?: number) =>
  new Nozle({ apiKey: "sk_test", maxRetries, retryDelayMs: 1 });

describe("opt-in retries", () => {
  it("never retries by default", async () => {
    fetchMock.mockResolvedValue(fail(503));
    await expect(client().plans()).rejects.toBeInstanceOf(NozleApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a read after a 503, a 429 and a network error, then succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(fail(503))
      .mockResolvedValueOnce(fail(429))
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(ok());
    await expect(client(3).plans()).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("stops after maxRetries and throws the last failure", async () => {
    fetchMock.mockResolvedValue(fail(500));
    const error = await client(2).plans().catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(NozleApiError);
    expect((error as NozleApiError).status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry a 4xx", async () => {
    fetchMock.mockResolvedValue(fail(422));
    await expect(client(3).plans()).rejects.toBeInstanceOf(NozleApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rethrows a network error once retries run out", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(client(1).plans()).rejects.toThrow("fetch failed");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("waits for Retry-After", async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockResolvedValueOnce(fail(503, { "retry-after": "2" })).mockResolvedValueOnce(ok());
      const pending = client(1).plans();
      await vi.advanceTimersByTimeAsync(1900);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(200);
      await expect(pending).resolves.toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries a write only when it is safe to repeat", async () => {
    fetchMock.mockResolvedValue(fail(503));
    // subscribe has no idempotency key: not retried.
    await expect(client(2).subscribe("c", "p")).rejects.toBeInstanceOf(NozleApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockClear();
    // usage.track carries an Idempotency-Key: retried.
    await expect(
      client(2).usage.track({ customerId: "c", featureCode: "f", timestamp: "2026-10-15T10:00:00Z" }, { idempotencyKey: "k1" }),
    ).rejects.toBeInstanceOf(NozleApiError);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    fetchMock.mockClear();
    // an event with a transaction id is idempotent: retried.
    await expect(client(2).track("c", "e", {}, { subscriptionId: "s", transactionId: "t1" })).rejects.toBeInstanceOf(Error);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
