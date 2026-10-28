import { afterEach, describe, expect, it, vi } from "vitest";
import { Nozle } from "../client";
import { NozleApiError, isNoActiveSubscription } from "../errors";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
afterEach(() => fetchMock.mockReset());

const failure = (status = 422, body: unknown = { code: "validation_errors", error_details: { base: ["bad"] } }, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, statusText: "Unprocessable Entity", headers });

describe("every failed request throws NozleApiError", () => {
  const secret = () => new Nozle({ apiKey: "sk_test" });
  const calls: Array<[string, () => Promise<unknown>]> = [
    ["plans", () => secret().plans()],
    ["ping", () => secret().ping()],
    ["can", () => secret().can("c", "f")],
    ["track", () => secret().track("c", "e", {}, { subscriptionId: "s" })],
    ["subscribe", () => secret().subscribe("c", "p")],
    ["checkAndDeduct", () => secret().checkAndDeduct({ customerId: "c", credits: 1 })],
    ["customers.upsert", () => secret().customers.upsert({ externalId: "c" })],
    ["creditSystems.list", () => secret().creditSystems.list()],
    ["costEvents.track", () => secret().costEvents.track({ costEventId: "e1", costMeterCode: "m", parentTransactionId: "t1", externalCustomerId: "c", timestamp: 1788345001 })],
    ["credits.getBalance", () => secret().credits.getBalance("c", "ai")],
    ["entities.get", () => secret().entities.get("c", "e")],
    ["usage.check", () => secret().usage.check({ customerId: "c", featureCode: "f" })],
    ["usage.track", () => secret().usage.track({ customerId: "c", featureCode: "f", creditSystemCode: "ai", timestamp: "2026-10-15T10:00:00Z" }, { idempotencyKey: "k1" })],
    ["subscription lookup", () => secret().track("c", "e")],
  ];

  it.each(calls)("%s", async (_name, call) => {
    fetchMock.mockResolvedValue(failure());
    const error = await call().then(
      () => undefined,
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(NozleApiError);
    expect((error as NozleApiError).status).toBe(422);
    expect((error as NozleApiError).code).toBe("validation_errors");
    expect((error as NozleApiError).hasCode("bad")).toBe(true);
  });

  it("keeps the status when the body is not JSON", async () => {
    fetchMock.mockResolvedValue(new Response("<html>", { status: 502, statusText: "Bad Gateway" }));
    const error = await secret().plans().catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(NozleApiError);
    expect((error as NozleApiError).status).toBe(502);
    expect((error as NozleApiError).code).toBeUndefined();
    expect((error as NozleApiError).message).toBe("plans failed: 502 Bad Gateway");
  });

  it("carries the request id and Retry-After seconds", async () => {
    fetchMock.mockResolvedValue(failure(503, {}, { "x-request-id": "req-1", "retry-after": "30" }));
    const error = (await secret().plans().catch((cause: unknown) => cause)) as NozleApiError;
    expect(error.requestId).toBe("req-1");
    expect(error.retryAfter).toBe(30);
  });

  it("reads a Retry-After date as seconds and ignores a bad value", async () => {
    const soon = new Date(Date.now() + 20_000).toUTCString();
    fetchMock.mockResolvedValueOnce(failure(429, {}, { "retry-after": soon }));
    const dated = (await secret().plans().catch((cause: unknown) => cause)) as NozleApiError;
    expect(dated.retryAfter).toBeGreaterThan(0);
    expect(dated.retryAfter).toBeLessThanOrEqual(20);
    fetchMock.mockResolvedValueOnce(failure(429, {}, { "retry-after": "soon" }));
    const bad = (await secret().plans().catch((cause: unknown) => cause)) as NozleApiError;
    expect(bad.retryAfter).toBeUndefined();
  });
});

describe("server text, Retry-After and the no-subscription code", () => {
  it("puts the server error text in the message and keeps the code", async () => {
    fetchMock.mockResolvedValueOnce(failure(422, { code: "invalid_date_range", error: "from must be before to" }));
    const error = await new Nozle({ apiKey: "sk_test" }).plans().catch((cause: unknown) => cause as NozleApiError);
    expect(error.message).toBe("plans failed: 422 Unprocessable Entity: from must be before to");
    expect(error.code).toBe("invalid_date_range");
  });

  it("keeps the plain message when the body has no text, and reads `message` as a fallback", async () => {
    fetchMock.mockResolvedValueOnce(failure(500, {}));
    const plain = await new Nozle({ apiKey: "sk_test" }).plans().catch((cause: unknown) => cause as Error);
    expect(plain.message).toBe("plans failed: 500 Unprocessable Entity");
    fetchMock.mockResolvedValueOnce(failure(400, { message: "bad input" }));
    const fallback = await new Nozle({ apiKey: "sk_test" }).plans().catch((cause: unknown) => cause as Error);
    expect(fallback.message).toBe("plans failed: 400 Unprocessable Entity: bad input");
  });

  it("treats Core's subscription_not_found and the SDK's code as one case", () => {
    const response = { status: 404, statusText: "Not Found" };
    expect(isNoActiveSubscription(new NozleApiError("x", response, { code: "subscription_not_found" }))).toBe(true);
    expect(isNoActiveSubscription(new NozleApiError("x", response, { code: "active_subscription_not_found" }))).toBe(true);
    expect(isNoActiveSubscription(new NozleApiError("x", response, { code: "other" }))).toBe(false);
    expect(isNoActiveSubscription(new Error("x"))).toBe(false);
  });
});
