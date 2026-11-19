import { afterEach, describe, expect, it, vi } from "vitest";
import { CustomerEraseErrorCode, Nozle, NozleApiError } from "../index";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
afterEach(() => fetchMock.mockReset());

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const client = (apiKey = "sk_test") =>
  new Nozle({ apiKey, baseUrl: "https://api.example/engine", eventsUrl: "https://api.example/core", maxRetries: 2, retryDelayMs: 1 });
const sent = (i = 0) => ({ url: String(fetchMock.mock.calls[i][0]), init: fetchMock.mock.calls[i][1] as RequestInit });

describe("customers.erase", () => {
  it("posts to /erase without a body and returns the customer with erased_at", async () => {
    fetchMock.mockResolvedValueOnce(json({ customer: { external_id: "c/1", erased_at: "2026-11-18T10:00:00Z" } }, 202));
    const customer = await client().customers.erase("c/1");
    expect(customer.erased_at).toBe("2026-11-18T10:00:00Z");
    expect(sent().url).toBe("https://api.example/core/api/v1/customers/c%2F1/erase");
    expect(sent().init.method).toBe("POST");
    expect(sent().init.body).toBeUndefined();
  });

  it("throws the 422 refusal codes from error_details.customer", async () => {
    fetchMock.mockResolvedValueOnce(
      json({ code: "validation_errors", error_details: { customer: ["has_active_subscriptions", "has_unpaid_invoices"] } }, 422),
    );
    const error = (await client().customers.erase("c1").catch((e: unknown) => e)) as NozleApiError;
    expect(error).toBeInstanceOf(NozleApiError);
    expect(error.hasCode(CustomerEraseErrorCode.HasActiveSubscriptions)).toBe(true);
    expect(error.hasCode(CustomerEraseErrorCode.HasUnpaidInvoices)).toBe(true);
    expect(error.hasCode(CustomerEraseErrorCode.HasDraftInvoices)).toBe(false);
  });

  it("requires a secret key and an external id", async () => {
    await expect(client("pk_test").customers.erase("c1")).rejects.toThrow("customers.erase requires a secret key");
    await expect(client().customers.erase(" ")).rejects.toThrow("customers.erase requires externalId");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("customers.delete", () => {
  it("sends DELETE and returns the deleted customer", async () => {
    fetchMock.mockResolvedValueOnce(json({ customer: { external_id: "c1", erased_at: null } }));
    expect(await client().customers.delete("c1")).toEqual({ external_id: "c1", erased_at: null });
    expect(sent().url).toBe("https://api.example/core/api/v1/customers/c1");
    expect(sent().init.method).toBe("DELETE");
  });
});

describe("customer writes are not retried", () => {
  it.each(["erase", "delete"] as const)("%s sends once on a 503", async (method) => {
    fetchMock.mockResolvedValue(json({ error: "unavailable" }, 503));
    await expect(client().customers[method]("c1")).rejects.toBeInstanceOf(NozleApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
