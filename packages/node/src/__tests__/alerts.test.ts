import { afterEach, describe, expect, it, vi } from "vitest";
import { Nozle } from "../index";

const alert = { nozle_id: "al_1", alert_type: "current_usage_amount", code: "spend", thresholds: [{ code: null, value: "5000.0", recurring: false }] };

function capture() {
  const calls: { method: string; url: string; body: unknown }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    calls.push({ method: init.method ?? "GET", url: String(input), body: init.body ? JSON.parse(String(init.body)) : undefined });
    return Response.json(String(input).endsWith("/alerts") && (init.method ?? "GET") === "GET" ? { alerts: [alert], meta: {} } : { alert });
  }));
  return calls;
}

const nozle = () => new Nozle({ apiKey: "sk_test", host: "https://api.example" });
afterEach(() => vi.unstubAllGlobals());

describe("alerts", () => {
  it("creates, lists, updates and deletes subscription usage alerts", async () => {
    const calls = capture();
    const target = { subscriptionId: "sub 1" };
    await nozle().alerts.create(target, {
      alertType: "feature_current_usage_units",
      code: "api_80",
      featureCode: "api_calls",
      thresholds: [{ value: 40000 }, { value: 10000, recurring: true }],
    });
    await nozle().alerts.list(target, { page: 2 });
    await nozle().alerts.update(target, "api_80", { name: "API calls at 80%" });
    await nozle().alerts.delete(target, "api_80");
    expect(calls).toEqual([
      {
        method: "POST",
        url: "https://api.example/core/api/v1/subscriptions/sub%201/alerts",
        body: { alert: { alert_type: "feature_current_usage_units", code: "api_80", feature_code: "api_calls", thresholds: [{ value: "40000" }, { value: "10000", recurring: true }] } },
      },
      { method: "GET", url: "https://api.example/core/api/v1/subscriptions/sub%201/alerts?page=2", body: undefined },
      { method: "PUT", url: "https://api.example/core/api/v1/subscriptions/sub%201/alerts/api_80", body: { alert: { name: "API calls at 80%" } } },
      { method: "DELETE", url: "https://api.example/core/api/v1/subscriptions/sub%201/alerts/api_80", body: undefined },
    ]);
  });

  it("addresses wallet alerts by customer and wallet code", async () => {
    const calls = capture();
    const result = await nozle().alerts.get({ customerId: "cus_1", walletCode: "main" }, "low");
    expect(result.code).toBe("spend");
    expect(calls[0].url).toBe("https://api.example/core/api/v1/customers/cus_1/wallets/main/alerts/low");
  });

  it("validates the target and needs a secret key", async () => {
    await expect(nozle().alerts.list({ subscriptionId: " " })).rejects.toThrow("subscriptionId");
    await expect(nozle().alerts.list({ customerId: "c", walletCode: "" })).rejects.toThrow("walletCode");
    await expect(new Nozle({ apiKey: "pk_x", host: "https://api.example" }).alerts.get({ subscriptionId: "s" }, "a")).rejects.toThrow("secret key");
  });
});
