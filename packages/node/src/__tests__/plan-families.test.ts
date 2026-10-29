import { afterEach, describe, expect, it, vi } from "vitest";
import { Nozle, type Plan } from "../index";

function capture(body: unknown = {}) {
  const calls: { url: string; body: unknown }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    calls.push({ url: String(input), body: init.body ? JSON.parse(String(init.body)) : undefined });
    return Response.json(body);
  }));
  return calls;
}

const nozle = () => new Nozle({ apiKey: "sk_test", host: "https://api.example" });
afterEach(() => vi.unstubAllGlobals());

describe("multi-currency plan families", () => {
  it("lists the catalog in a currency or the customer's currency and returns family and prices", async () => {
    const plan: Plan = {
      code: "pro_eur", name: "Pro", amount_cents: 4500, amount_currency: "EUR", interval: "monthly",
      family: { code: "pro", currencies: ["USD", "EUR"], default_currency: "USD" },
      prices: [
        { currency: "USD", interval: "monthly", plan_code: "pro", amount_cents: 4900 },
        { currency: "EUR", interval: "monthly", plan_code: "pro_eur", amount_cents: 4500 },
      ],
    };
    const calls = capture({ plans: [plan] });
    expect(await nozle().plans({ currency: "EUR", externalCustomerId: "cus 1", includeHidden: false })).toEqual([plan]);
    await nozle().plans();
    const [first, second] = calls.map((call) => new URL(call.url));
    expect(first.pathname).toBe(second.pathname);
    expect(Object.fromEntries(first.searchParams)).toEqual({ include_hidden: "false", currency: "EUR", external_customer_id: "cus 1" });
    expect(second.search).toBe("");
  });

  it("checks out and subscribes by family, interval and currency instead of a plan code", async () => {
    const calls = capture({ type: "completed" });
    await nozle().checkout("cust", { planFamilyCode: "pro", interval: "yearly", currency: "EUR" }, "https://app.example/done");
    await nozle().subscribe("cust", { planFamilyCode: "pro", interval: "monthly" });
    await nozle().checkout("cust", "pro_eur");
    expect(calls.map((call) => call.body)).toEqual([
      { plan_family_code: "pro", interval: "yearly", currency: "EUR", customer_id: "cust", return_url: "https://app.example/done" },
      { plan_family_code: "pro", interval: "monthly", customer_id: "cust" },
      { plan_code: "pro_eur", customer_id: "cust" },
    ]);
  });

  it("requires a family code and an interval", async () => {
    capture();
    await expect(nozle().checkout("cust", { planFamilyCode: "pro", interval: " " })).rejects.toThrow("checkout requires planFamilyCode and interval");
    await expect(nozle().subscribe("cust", { planFamilyCode: "", interval: "monthly" })).rejects.toThrow("subscribe requires planFamilyCode and interval");
  });
});
