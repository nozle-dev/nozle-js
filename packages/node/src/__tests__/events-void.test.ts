import { describe, it, expect, vi, beforeEach } from "vitest";
import { Nozle } from "../client";
import { EventVoidErrorCode, NozleApiError, NozleValidationError } from "../errors";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function jsonResponse(data: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, statusText: status === 200 ? "OK" : "Error", json: () => Promise.resolve(data) };
}

const voided = {
  void: {
    transaction_id: "tx_123",
    status: "voided",
    reason: "wrong quantity",
    voided_at: "2026-11-01T12:00:00Z",
    actor: "api_key:k1",
    effects: { event: "voided", usage: "reversed", credits: "not_applicable", cost: "pending", margin: "pending" },
  },
};

beforeEach(() => fetchMock.mockReset());

describe("events.void", () => {
  it("posts the reason to the void URL and returns { void }", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(voided));
    const client = new Nozle({ apiKey: "sk_test", baseUrl: "https://e.example" });
    const result = await client.events.void("tx/123", { reason: "wrong quantity" });
    expect(result).toEqual(voided);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://e.example/api/v1/events/tx%2F123/void");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer sk_test");
    expect(JSON.parse(init.body)).toEqual({ reason: "wrong quantity" });
  });

  it("validates before any request", async () => {
    const client = new Nozle({ apiKey: "sk_test" });
    await expect(client.events.void("", { reason: "x" })).rejects.toBeInstanceOf(NozleValidationError);
    await expect(client.events.void("tx", { reason: "" })).rejects.toBeInstanceOf(NozleValidationError);
    await expect(client.events.void("tx", { reason: "x".repeat(501) })).rejects.toBeInstanceOf(NozleValidationError);
    await expect(new Nozle({ apiKey: "pk_test" }).events.void("tx", { reason: "x" })).rejects.toThrow("secret key");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [404, EventVoidErrorCode.EventNotFound],
    [409, EventVoidErrorCode.PeriodInvoiced],
    [422, EventVoidErrorCode.ReasonRequired],
  ])("maps %i %s to NozleApiError.hasCode", async (status, code) => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: code, message: "nope" }, status));
    const client = new Nozle({ apiKey: "sk_test" });
    const error = await client.events.void("tx", { reason: "x" }).catch((e) => e);
    expect(error).toBeInstanceOf(NozleApiError);
    expect(error.status).toBe(status);
    expect(error.hasCode(code)).toBe(true);
    expect(error.hasCode(EventVoidErrorCode.TransactionVoided)).toBe(false);
  });
});
