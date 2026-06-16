import { describe, it, expect, vi, beforeEach } from "vitest";
import { Nozle } from "../client";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "OK",
    json: () => Promise.resolve(data),
  };
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe("Nozle", () => {
  it("initializes with defaults", () => {
    const client = new Nozle({ apiKey: "sk_test" });
    expect(client.apiKey).toBe("sk_test");
    expect(client.baseUrl).toBe("http://localhost:8080");
    expect(client.eventsUrl).toBe("http://localhost:3000");
  });

  it("strips trailing slashes", () => {
    const client = new Nozle({
      apiKey: "sk_test",
      baseUrl: "https://api.example.com/",
      eventsUrl: "https://events.example.com/",
    });
    expect(client.baseUrl).toBe("https://api.example.com");
    expect(client.eventsUrl).toBe("https://events.example.com");
  });

  describe("track", () => {
    it("sends event with explicit subscriptionId", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({}));
      const client = new Nozle({ apiKey: "sk_test" });
      await client.track("cust_1", "api_call", { tokens: 100 }, { subscriptionId: "sub_1" });

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe("http://localhost:3000/api/v1/events");
      const body = JSON.parse(opts.body);
      expect(body.event.external_customer_id).toBe("cust_1");
      expect(body.event.code).toBe("api_call");
      expect(body.event.external_subscription_id).toBe("sub_1");
      expect(body.event.properties).toEqual({ tokens: 100 });
    });

    it("generates transaction_id when not provided", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({}));
      const client = new Nozle({ apiKey: "sk_test" });
      await client.track("cust_1", "api_call", undefined, { subscriptionId: "sub_1" });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.event.transaction_id).toHaveLength(36);
    });

    it("auto-resolves subscription when not provided", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ subscriptions: [{ external_id: "sub_auto" }] }))
        .mockResolvedValueOnce(jsonResponse({}));

      const client = new Nozle({ apiKey: "sk_test" });
      await client.track("cust_1", "api_call");

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const trackBody = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(trackBody.event.external_subscription_id).toBe("sub_auto");
    });

    it("caches resolved subscription", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ subscriptions: [{ external_id: "sub_cached" }] }))
        .mockResolvedValueOnce(jsonResponse({}))
        .mockResolvedValueOnce(jsonResponse({}));

      const client = new Nozle({ apiKey: "sk_test" });
      await client.track("cust_1", "event_1");
      await client.track("cust_1", "event_2");

      // 1 subscription lookup + 2 track calls = 3 fetches (not 4)
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("throws when no active subscription found", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ subscriptions: [] }));
      const client = new Nozle({ apiKey: "sk_test" });
      await expect(client.track("cust_1", "event")).rejects.toThrow("No active subscription");
    });

    it("throws when multiple subscriptions found", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ subscriptions: [{ external_id: "a" }, { external_id: "b" }] }),
      );
      const client = new Nozle({ apiKey: "sk_test" });
      await expect(client.track("cust_1", "event")).rejects.toThrow("2 active subscriptions");
    });
  });

  describe("can", () => {
    it("returns entitlement check result", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ allowed: true, used: 5, limit: 100, remaining: 95 }),
      );
      const client = new Nozle({ apiKey: "sk_test" });
      const result = await client.can("cust_1", "code_completion");

      expect(result.allowed).toBe(true);
      expect(result.used).toBe(5);
      const [url] = fetchMock.mock.calls[0];
      expect(url.toString()).toContain("/api/v1/can");
      expect(url.toString()).toContain("customer_id=cust_1");
      expect(url.toString()).toContain("feature=code_completion");
    });
  });

  describe("plans", () => {
    it("fetches available plans", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ plans: [{ code: "pro", name: "Pro", amount_cents: 4900 }] }),
      );
      const client = new Nozle({ apiKey: "sk_test" });
      const plans = await client.plans();

      expect(plans).toHaveLength(1);
      expect(plans[0].code).toBe("pro");
    });
  });

  describe("checkout", () => {
    it("creates checkout session", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ client_secret: "cs_test", session_id: "sess_1", plan_code: "pro" }),
      );
      const client = new Nozle({ apiKey: "sk_test" });
      const result = await client.checkout("cust_1", "pro");

      expect(result.client_secret).toBe("cs_test");
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.plan_code).toBe("pro");
      expect(body.customer_id).toBe("cust_1");
    });
  });

  describe("subscribe", () => {
    it("creates subscription", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ subscription_id: "sub_1", status: "active" }),
      );
      const client = new Nozle({ apiKey: "sk_test" });
      const result = await client.subscribe("cust_1", "pro");

      expect(result.subscription_id).toBe("sub_1");
      expect(result.status).toBe("active");
    });
  });

  describe("margin", () => {
    it("fetches summary", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ margin: 0.42 }));
      const client = new Nozle({ apiKey: "sk_test" });
      const result = await client.margin.summary();
      expect(result).toEqual({ margin: 0.42 });
    });

    it("fetches by customer", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse([{ customer: "c1", margin: 0.5 }]),
      );
      const client = new Nozle({ apiKey: "sk_test" });
      const result = await client.margin.byCustomer();
      expect((result as any)[0].customer).toBe("c1");
    });

    it("passes granularity to trend", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ points: [] }));
      const client = new Nozle({ apiKey: "sk_test" });
      await client.margin.trend({ granularity: "week" });

      const [url] = fetchMock.mock.calls[0];
      expect(url.toString()).toContain("granularity=week");
    });
  });
});
