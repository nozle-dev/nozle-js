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

  describe("credit systems and balances", () => {
    it("lists active credit systems", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          credit_systems: [
            {
              lago_id: "system-1",
              code: "ai_credits",
              name: "AI Credits",
              description: null,
              unit_name: "credit",
              status: "active",
              created_at: "2026-07-20T12:00:00Z",
              updated_at: "2026-07-20T12:00:00Z",
            },
          ],
          meta: { next_page: null },
        }),
      );
      const client = new Nozle({
        apiKey: "sk_test",
        eventsUrl: "https://core.example",
      });

      const systems = await client.creditSystems.list();

      expect(systems).toEqual([
        {
          id: "system-1",
          code: "ai_credits",
          name: "AI Credits",
          description: null,
          unitName: "credit",
          status: "active",
          createdAt: "2026-07-20T12:00:00Z",
          updatedAt: "2026-07-20T12:00:00Z",
        },
      ]);
      expect(fetchMock.mock.calls[0][0].toString()).toBe(
        "https://core.example/api/v1/credit-systems?status=active&page=1&per_page=100",
      );
    });

    it("reads every Rails-owned credit system page", async () => {
      const coreSystem = (id: string, code: string) => ({
        lago_id: id,
        code,
        name: code,
        description: null,
        unit_name: "credit",
        status: "active",
        created_at: "2026-07-20T12:00:00Z",
        updated_at: "2026-07-20T12:00:00Z",
      });
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse({ credit_systems: [coreSystem("system-1", "ai")], meta: { next_page: 2 } }),
        )
        .mockResolvedValueOnce(
          jsonResponse({ credit_systems: [coreSystem("system-2", "api")], meta: { next_page: null } }),
        );
      const client = new Nozle({ apiKey: "sk_test", eventsUrl: "https://core.example" });

      const systems = await client.creditSystems.list();

      expect(systems.map(({ code }) => code)).toEqual(["ai", "api"]);
      expect(fetchMock.mock.calls[1][0].toString()).toContain("page=2");
    });

    it("reads an exact-decimal customer balance and escapes path identifiers", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          customer_id: "acme/west",
          credit_system: "ai credits",
          available: "123456789012345678.123456789012",
          sources: [{ remaining: "375.000000000001" }],
        }),
      );
      const client = new Nozle({
        apiKey: "sk_test",
        baseUrl: "https://engine.example",
      });

      const balance = await client.credits.getBalance("acme/west", "ai credits");

      expect(balance.available).toBe("123456789012345678.123456789012");
      expect(balance.sources[0].remaining).toBe("375.000000000001");
      expect(fetchMock.mock.calls[0][0]).toBe(
        "https://engine.example/api/v1/customers/acme%2Fwest/credit-systems/ai%20credits/balance",
      );
    });

    it("lists customer balances and cursor-paginates immutable operations", async () => {
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse({
            customer_id: "acme/west",
            as_of: "2026-07-20T12:00:00.750Z",
            balances: [{ credit_system: "ai_credits", available: "500.000000000001" }],
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            customer_id: "acme/west",
            operations: [{ id: "operation-1", credit_amount: "2.000000000001" }],
            next_cursor: "next/page",
          }),
        );
      const client = new Nozle({ apiKey: "sk_test", baseUrl: "https://engine.example" });

      const balances = await client.credits.listBalances("acme/west");
      const operations = await client.credits.listOperations("acme/west", {
        creditSystemCode: "ai credits",
        limit: 25,
        cursor: "current/page",
      });

      expect(balances.balances[0].available).toBe("500.000000000001");
      expect(operations.operations[0].credit_amount).toBe("2.000000000001");
      expect(fetchMock.mock.calls[0][0]).toBe(
        "https://engine.example/api/v1/customers/acme%2Fwest/credit-systems",
      );
      expect(fetchMock.mock.calls[1][0].toString()).toBe(
        "https://engine.example/api/v1/customers/acme%2Fwest/credit-operations?credit_system_code=ai+credits&limit=25&cursor=current%2Fpage",
      );
    });

    it("preserves a null next cursor when operation history is exhausted", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          customer_id: "acme",
          operations: [],
          next_cursor: null,
        }),
      );
      const client = new Nozle({ apiKey: "sk_test", baseUrl: "https://engine.example" });

      const operations = await client.credits.listOperations("acme");

      expect(operations.next_cursor).toBeNull();
    });

    it("rejects invalid operation limits without a request", async () => {
      const client = new Nozle({ apiKey: "sk_test" });
      await expect(client.credits.listOperations("acme", { limit: 101 })).rejects.toThrow(
        "between 1 and 100",
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("customer sessions", () => {
    it("mints a short-lived customer-bound read session with a secret key", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          customer_session: {
            token: "csess_token",
            customer_id: "acme/west",
            expires_at: "2026-07-20T12:15:00Z",
            scope: ["credits:read"],
          },
        }),
      );
      const client = new Nozle({ apiKey: "sk_test", baseUrl: "https://engine.example" });

      const session = await client.customerSessions.create({
        customerId: "acme/west",
        expiresInSeconds: 900,
      });

      expect(session.token).toBe("csess_token");
      expect(fetchMock).toHaveBeenCalledWith(
        "https://engine.example/api/v1/customer-sessions",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ customer_id: "acme/west", expires_in_seconds: 900 }),
        }),
      );
    });

    it("never mints customer sessions with a publishable key", async () => {
      const client = new Nozle({ apiKey: "pk_browser" });
      await expect(
        client.customerSessions.create({ customerId: "acme" }),
      ).rejects.toThrow("requires a secret key");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("usage", () => {
    it("performs an advisory check with the runtime credit contract", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          advisory: true,
          allowed: true,
          metric_amount: "1",
          credit_system: "ai_credits",
          credits_required: "2.000000000001",
          available: "500",
          projected_remaining: "497.999999999999",
          projected_deductions: [
            {
              balance_source_id: "source-1",
              source_type: "subscription_grant",
              amount: "2.000000000001",
              remaining: "247.999999999999",
            },
          ],
        }),
      );
      const client = new Nozle({ apiKey: "sk_test" });

      const result = await client.usage.check({
        customerId: "acme",
        billableMetricCode: "agent_execution",
        creditSystemCode: "ai_credits",
        properties: { model: "gpt-5" },
        occurredAt: "2026-07-20T12:00:00.750Z",
      });

      expect(result.advisory).toBe(true);
      expect(result.projected_remaining).toBe("497.999999999999");
      expect(result.projected_deductions?.[0]).toEqual({
        balance_source_id: "source-1",
        source_type: "subscription_grant",
        amount: "2.000000000001",
        remaining: "247.999999999999",
      });
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe("http://localhost:8080/api/v1/usage/check");
      expect(JSON.parse(options.body)).toEqual({
        customer_id: "acme",
        billable_metric_code: "agent_execution",
        credit_system_code: "ai_credits",
        properties: { model: "gpt-5" },
        occurred_at: "2026-07-20T12:00:00.750Z",
      });
    });

    it("tracks atomically with the caller's idempotency key and millisecond timestamp", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          allowed: true,
          operation_id: "operation-1",
          remaining: "498",
        }),
      );
      const client = new Nozle({ apiKey: "sk_test" });

      const result = await client.usage.track(
        {
          customerId: "acme",
          billableMetricCode: "agent_execution",
          properties: { request: 1 },
          timestamp: "2026-07-20T12:00:00.750Z",
        },
        { idempotencyKey: "execution-1" },
      );

      expect(result.operation_id).toBe("operation-1");
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe("http://localhost:8080/api/v1/usage/track");
      expect(options.headers["Idempotency-Key"]).toBe("execution-1");
      expect(JSON.parse(options.body).timestamp).toBe("2026-07-20T12:00:00.750Z");
    });

    it("rejects publishable-key mutation locally without making a request", async () => {
      const client = new Nozle({ apiKey: "pk_browser" });

      await expect(
        client.usage.track(
          { customerId: "acme", billableMetricCode: "agent_execution" },
          { idempotencyKey: "execution-1" },
        ),
      ).rejects.toThrow("requires a secret key");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects missing or oversized idempotency keys before making a request", async () => {
      const client = new Nozle({ apiKey: "sk_test" });
      const params = {
        customerId: "acme",
        billableMetricCode: "agent_execution",
      };

      await expect(client.usage.track(params, { idempotencyKey: "" })).rejects.toThrow("non-empty idempotencyKey");
      await expect(client.usage.track(params, { idempotencyKey: "x".repeat(256) })).rejects.toThrow(
        "must not exceed 255 bytes",
      );
      await expect(client.usage.track(params, { idempotencyKey: "é".repeat(128) })).rejects.toThrow(
        "must not exceed 255 bytes",
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
