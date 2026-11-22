import { afterEach, describe, expect, it, vi } from "vitest";
import { Nozle, NozleApiError } from "../index";

afterEach(() => vi.unstubAllGlobals());

function capture(status = 200, payload: unknown = { token: "tok", customer_id: "cus 1", expires_at: "2026-11-22T13:00:00Z" }) {
  const calls: { method: string; url: string; body: unknown; auth: string | null }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    calls.push({ method: init.method ?? "GET", url: String(input), body: JSON.parse(String(init.body)), auth: new Headers(init.headers).get("authorization") });
    return Response.json(payload, { status });
  }));
  return calls;
}

describe("customerTokens", () => {
  it("mints a token on Core with the secret key, and revokes them", async () => {
    const calls = capture();
    const nozle = new Nozle({ apiKey: "sk_test", host: "https://api.example" });

    expect(await nozle.customerTokens.create("cus 1", { ttlSeconds: 600, features: ["seats"] })).toEqual({
      token: "tok", customer_id: "cus 1", expires_at: "2026-11-22T13:00:00Z",
    });
    await nozle.customerTokens.create("cus 1");
    await nozle.customerTokens.revoke();

    expect(calls).toEqual([
      { method: "POST", url: "https://api.example/core/api/v1/customer_tokens", body: { customer_id: "cus 1", ttl_seconds: 600, features: ["seats"] }, auth: "Bearer sk_test" },
      { method: "POST", url: "https://api.example/core/api/v1/customer_tokens", body: { customer_id: "cus 1" }, auth: "Bearer sk_test" },
      { method: "POST", url: "https://api.example/core/api/v1/customer_tokens/revoke", body: {}, auth: "Bearer sk_test" },
    ]);
  });

  it("refuses a publishable key or a blank customer before calling Nozle", async () => {
    const calls = capture();

    await expect(new Nozle({ apiKey: "pk_test" }).customerTokens.create("cus")).rejects.toThrow("secret key");
    await expect(new Nozle({ apiKey: "sk_test" }).customerTokens.create(" ")).rejects.toThrow("customerId");
    expect(calls).toEqual([]);
  });

  it("surfaces Core's refusal", async () => {
    capture(404, { status: 404, error: "Not Found", code: "customer_not_found" });

    const error = await new Nozle({ apiKey: "sk_test" }).customerTokens.create("missing").catch((e) => e);
    expect(error).toBeInstanceOf(NozleApiError);
    expect(error.status).toBe(404);
  });
});
