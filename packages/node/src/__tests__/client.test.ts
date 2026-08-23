import { describe, it, expect, vi, beforeEach } from "vitest";
import { Nozle } from "../client";
import type { CancellationPolicy } from "../types";

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

  describe("customers", () => {
    it("upserts through Core with the merchant key and Core contract", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          customer: { external_id: "cust/1", name: "Acme", email: "billing@acme.test" },
        }),
      );
      const client = new Nozle({
        apiKey: "sk_merchant",
        baseUrl: "https://engine.example",
        eventsUrl: "https://core.example",
      });

      const customer = await client.customers.upsert({
        externalId: "cust/1",
        name: "Acme",
        email: "billing@acme.test",
      });

      expect(customer).toEqual({
        external_id: "cust/1",
        name: "Acme",
        email: "billing@acme.test",
      });
      expect(fetchMock).toHaveBeenCalledWith(
        "https://core.example/api/v1/customers",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ Authorization: "Bearer sk_merchant" }),
        }),
      );
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
        customer: {
          external_id: "cust/1",
          name: "Acme",
          email: "billing@acme.test",
        },
      });
    });

    it("never sends customer upserts to Engine", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ customer: { external_id: "cust-1" } }));
      const client = new Nozle({
        apiKey: "sk_merchant",
        baseUrl: "https://engine.example",
        eventsUrl: "https://core.example",
      });

      await client.customers.upsert({ externalId: "cust-1" });

      expect(String(fetchMock.mock.calls[0][0])).not.toContain("engine.example");
    });

    it("rejects publishable keys and missing customer IDs before network I/O", async () => {
      await expect(
        new Nozle({ apiKey: "pk_browser" }).customers.upsert({ externalId: "cust-1" }),
      ).rejects.toThrow("requires a secret key");
      await expect(
        new Nozle({ apiKey: "sk_merchant" }).customers.upsert({ externalId: "" }),
      ).rejects.toThrow("requires externalId");
      expect(fetchMock).not.toHaveBeenCalled();
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
      const result = await client.checkout(
        "cust_1",
        "pro",
        "https://merchant.example/billing/complete",
      );

      expect(result).toMatchObject({ client_secret: "cs_test" });
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.plan_code).toBe("pro");
      expect(body.customer_id).toBe("cust_1");
      expect(body.return_url).toBe("https://merchant.example/billing/complete");
    });

    it("rejects publishable-key checkout before network I/O", async () => {
      const client = new Nozle({ apiKey: "pk_browser" });

      await expect(client.checkout("cust_1", "pro")).rejects.toThrow(
        "checkout requires a secret key",
      );
      expect(fetchMock).not.toHaveBeenCalled();
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

    it("rejects publishable-key subscription attempts before network I/O", async () => {
      const client = new Nozle({ apiKey: "pk_browser" });
      await expect(client.subscribe("cust_1", "pro")).rejects.toThrow(
        "subscribe requires a secret key",
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("cancelSubscription", () => {
    it("schedules end-of-period cancellation by default", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          subscription: {
            external_id: "sub/1",
            status: "active",
            ending_at: "2026-08-14T18:30:00Z",
          },
        }),
      );
      const client = new Nozle({ apiKey: "sk_test" });

      const result = await client.cancelSubscription("customer 1", "sub/1");

      expect(result.subscription.status).toBe("active");
      expect(result.subscription.ending_at).toBe("2026-08-14T18:30:00Z");
      const [url, init] = fetchMock.mock.calls[0];
      expect(url.toString()).toContain("/api/v1/subscriptions/sub%2F1?");
      expect(url.toString()).toContain("customer_id=customer+1");
      expect(url.toString()).toContain("cancellation_policy=end_of_period");
      expect(init.method).toBe("DELETE");
    });

    it("can request explicit immediate termination", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          subscription: { external_id: "sub_1", status: "terminated", ending_at: null },
        }),
      );
      const client = new Nozle({ apiKey: "sk_test" });

      await client.cancelSubscription("cust_1", "sub_1", "immediate");

      expect(fetchMock.mock.calls[0][0].toString()).toContain("cancellation_policy=immediate");
    });

    it("rejects publishable-key cancellation before network I/O", async () => {
      const client = new Nozle({ apiKey: "pk_browser" });

      await expect(client.cancelSubscription("cust_1", "sub_1")).rejects.toThrow(
        "cancelSubscription requires a secret key",
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects invalid input before network I/O", async () => {
      const client = new Nozle({ apiKey: "sk_test" });

      await expect(client.cancelSubscription("", "sub_1")).rejects.toThrow(
        "requires customerId and subscriptionId",
      );
      await expect(
        client.cancelSubscription("cust_1", "sub_1", "whenever" as CancellationPolicy),
      ).rejects.toThrow("policy must be end_of_period or immediate");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("subscription transition settlements", () => {
    it("previews the explicit merchant contract", async () => {
      const client = new Nozle({ apiKey: "sk_test" });
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ subscription_transition: { amount_due_cents: 0 } }), {
          status: 200,
        }),
      );

      await client.previewSubscriptionTransition({
        customerId: "customer-1",
        subscriptionId: "sub-1",
        operation: "cancel",
        timing: "end_of_period",
      });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url.toString()).toContain("/api/v1/subscriptions/transitions/preview");
      expect(JSON.parse(init?.body as string)).toEqual({
        customer_id: "customer-1",
        subscription_id: "sub-1",
        operation: "cancel",
        timing: "end_of_period",
      });
    });

    it("applies a downgrade with the caller idempotency key", async () => {
      const client = new Nozle({ apiKey: "sk_test" });
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ subscription_transition: { id: "transition-1" } }), {
          status: 200,
        }),
      );

      await client.applySubscriptionTransition(
        {
          customerId: "customer-1",
          subscriptionId: "sub-1",
          operation: "downgrade",
          timing: "immediate",
          targetPlanCode: "starter",
          creditAction: "refund",
          refundMode: "full",
          finalInvoiceAction: "generate",
        },
        "downgrade-1",
      );

      const [, init] = fetchMock.mock.calls[0];
      expect(new Headers(init?.headers).get("Idempotency-Key")).toBe("downgrade-1");
    });

    it("rejects unsafe shapes before network I/O", async () => {
      const client = new Nozle({ apiKey: "sk_test" });
      await expect(
        client.applySubscriptionTransition(
          {
            customerId: "customer-1",
            subscriptionId: "sub-1",
            operation: "cancel",
            timing: "immediate",
            targetPlanCode: "starter",
          },
          "key-1",
        ),
      ).rejects.toThrow("targetPlanCode is forbidden");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("uncancels without inventing settlement defaults", async () => {
      const client = new Nozle({ apiKey: "sk_test" });
      fetchMock.mockResolvedValueOnce(jsonResponse({ subscription_transition: { id: "t-2" } }));

      await client.applySubscriptionTransition(
        {
          customerId: "customer-1",
          subscriptionId: "sub-1",
          operation: "uncancel",
        },
        "uncancel-1",
      );

      const [, init] = fetchMock.mock.calls[0];
      expect(JSON.parse(init?.body as string)).toEqual({
        customer_id: "customer-1",
        subscription_id: "sub-1",
        operation: "uncancel",
      });
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
        featureCode: "agent_execution",
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
        feature_code: "agent_execution",
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
          entityId: "user/42",
          featureCode: "agent_execution",
          properties: { request: 1 },
          timestamp: "2026-07-20T12:00:00.750Z",
        },
        { idempotencyKey: "execution-1" },
      );

      expect(result.operation_id).toBe("operation-1");
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe("http://localhost:8080/api/v1/usage/track");
      expect(options.headers["Idempotency-Key"]).toBe("execution-1");
      expect(JSON.parse(options.body)).toEqual({
        customer_id: "acme",
        entity_id: "user/42",
        feature_code: "agent_execution",
        properties: { request: 1 },
        timestamp: "2026-07-20T12:00:00.750Z",
      });
    });

    it("rejects publishable-key mutation locally without making a request", async () => {
      const client = new Nozle({ apiKey: "pk_browser" });

      await expect(
        client.usage.track(
          { customerId: "acme", featureCode: "agent_execution" },
          { idempotencyKey: "execution-1" },
        ),
      ).rejects.toThrow("requires a secret key");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects missing or oversized idempotency keys before making a request", async () => {
      const client = new Nozle({ apiKey: "sk_test" });
      const params = {
        customerId: "acme",
        featureCode: "agent_execution",
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

  describe("entities", () => {
    const entity = {
      id: "entity-uuid",
      customer_id: "acme/west",
      external_id: "user/42",
      name: "Asha",
      status: "active",
      metadata: { role: "admin" },
      created_at: "2026-07-20T12:00:00Z",
      updated_at: "2026-07-20T12:00:00Z",
      deleted_at: null,
    };

    it("lists and upserts Entities with escaped identifiers and exact idempotency", async () => {
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse({ customer_id: "acme/west", entities: [entity], next_cursor: null }),
        )
        .mockResolvedValueOnce(jsonResponse({ action: "updated", entity, replayed: false }));
      const client = new Nozle({ apiKey: "sk_test", baseUrl: "https://engine.example" });

      const page = await client.entities.list("acme/west", { status: "active", limit: 25 });
      const result = await client.entities.upsert(
        "acme/west",
        "user/42",
        { name: "Asha", status: "active", metadata: { role: "admin" } },
        { idempotencyKey: "entity-user-42-v2" },
      );

      expect(page.next_cursor).toBeNull();
      expect(page.entities[0].external_id).toBe("user/42");
      expect(result.entity.external_id).toBe("user/42");
      expect(fetchMock.mock.calls[0][0].toString()).toBe(
        "https://engine.example/api/v1/customers/acme%2Fwest/entities?status=active&limit=25",
      );
      expect(fetchMock.mock.calls[1][0]).toBe(
        "https://engine.example/api/v1/customers/acme%2Fwest/entities/user%2F42",
      );
      expect(fetchMock.mock.calls[1][1].headers["Idempotency-Key"]).toBe("entity-user-42-v2");
      expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
        name: "Asha",
        status: "active",
        metadata: { role: "admin" },
      });
    });

    it("suspends without discarding the current name or metadata", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ entity }))
        .mockResolvedValueOnce(
          jsonResponse({
            action: "suspended",
            entity: { ...entity, status: "suspended" },
            replayed: false,
          }),
        );
      const client = new Nozle({ apiKey: "sk_test", baseUrl: "https://engine.example" });

      await client.entities.suspend("acme/west", "user/42", {
        idempotencyKey: "suspend-user-42",
      });

      expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
        name: "Asha",
        status: "suspended",
        metadata: { role: "admin" },
      });
    });

    it("bulk upserts Entities and rejects publishable-key mutations locally", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ customer_id: "acme", entities: [], counts: {}, replayed: false }),
      );
      const secretClient = new Nozle({ apiKey: "sk_test", baseUrl: "https://engine.example" });
      await secretClient.entities.bulkUpsert(
        "acme",
        [{ externalId: "user-1", status: "active" }],
        { idempotencyKey: "import-1" },
      );
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
        entities: [{ external_id: "user-1", name: null, status: "active", metadata: {} }],
      });

      fetchMock.mockReset();
      const browserClient = new Nozle({ apiKey: "pk_browser" });
      await expect(
        browserClient.entities.suspend("acme", "user-1", { idempotencyKey: "suspend-1" }),
      ).rejects.toThrow("requires a secret key");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects invalid limits, duplicate bulk IDs, and multibyte idempotency keys", async () => {
      const client = new Nozle({ apiKey: "sk_test" });
      await expect(client.entities.list("acme", { limit: 101 })).rejects.toThrow(
        "between 1 and 100",
      );
      await expect(
        client.entities.bulkUpsert(
          "acme",
          [
            { externalId: "user-1", status: "active" },
            { externalId: "user-1", status: "suspended" },
          ],
          { idempotencyKey: "import-1" },
        ),
      ).rejects.toThrow("duplicate externalId");
      await expect(
        client.entities.upsert(
          "acme",
          "user-1",
          { status: "active" },
          { idempotencyKey: "é".repeat(128) },
        ),
      ).rejects.toThrow("must not exceed 255 bytes");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("Entity credit reads and transfers", () => {
    it("reads separate Entity/shared/effective totals and Entity operation history", async () => {
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse({
            customer_id: "acme/west",
            entity_id: "user/42",
            entity_status: "active",
            credit_system: "ai credits",
            entity_available: "480.000000000001",
            shared_available: "250",
            effective_available: "730.000000000001",
            pool_policy: "entity_then_customer",
            sources: [],
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            customer_id: "acme/west",
            entity_id: "user/42",
            operations: [{ id: "operation-1", entity_id: "user/42" }],
            next_cursor: null,
          }),
        );
      const client = new Nozle({ apiKey: "sk_test", baseUrl: "https://engine.example" });

      const balance = await client.credits.getEntityBalance(
        "acme/west",
        "user/42",
        "ai credits",
      );
      const operations = await client.credits.listEntityOperations("acme/west", "user/42", {
        limit: 25,
      });

      expect(balance.effective_available).toBe("730.000000000001");
      expect(operations.next_cursor).toBeNull();
      expect(fetchMock.mock.calls[0][0]).toBe(
        "https://engine.example/api/v1/customers/acme%2Fwest/entities/user%2F42/credit-systems/ai%20credits/balance",
      );
      expect(fetchMock.mock.calls[1][0].toString()).toBe(
        "https://engine.example/api/v1/customers/acme%2Fwest/entities/user%2F42/credit-operations?limit=25",
      );
    });

    it("allocates and deallocates exact decimal amounts with caller idempotency", async () => {
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse({
            transferred: true,
            direction: "allocation",
            amount: "100.000000000001",
            replayed: false,
          }, 201),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            transferred: true,
            direction: "deallocation",
            amount: "25",
            replayed: false,
          }),
        );
      const client = new Nozle({ apiKey: "sk_test", baseUrl: "https://engine.example" });

      await client.credits.allocate(
        "acme",
        "user-42",
        { creditSystemCode: "ai_credits", amount: "100.000000000001" },
        { idempotencyKey: "allocate-1" },
      );
      await client.credits.deallocate(
        "acme",
        "user-42",
        { creditSystemCode: "ai_credits", amount: "25" },
        { idempotencyKey: "deallocate-1" },
      );

      expect(fetchMock.mock.calls[0][1].headers["Idempotency-Key"]).toBe("allocate-1");
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
        credit_system: "ai_credits",
        amount: "100.000000000001",
      });
      expect(String(fetchMock.mock.calls[1][0])).toContain("credit-deallocations");
    });

    it("rejects lossy amounts and publishable-key transfers without a request", async () => {
      const client = new Nozle({ apiKey: "sk_test" });
      await expect(
        client.credits.allocate(
          "acme",
          "user-1",
          { creditSystemCode: "ai", amount: "0.0000000000001" },
          { idempotencyKey: "allocation-1" },
        ),
      ).rejects.toThrow("positive decimal string");

      const browserClient = new Nozle({ apiKey: "pk_browser" });
      await expect(
        browserClient.credits.deallocate(
          "acme",
          "user-1",
          { creditSystemCode: "ai", amount: "1" },
          { idempotencyKey: "deallocation-1" },
        ),
      ).rejects.toThrow("requires a secret key");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("Entity subscriptions", () => {
    const entitySubscription = {
      external_customer_id: "workspace/1",
      external_entity_id: "user/42",
      external_subscription_id: "entity-sub-1",
      status: "active",
      current_plan: {
        code: "pro",
        name: "Pro",
        interval: "monthly",
        amount_cents: 1499,
        amount_currency: "USD",
        status: "active",
        effective_at: "2026-08-03T00:00:00Z",
      },
      pending_plan: null,
      billing_time: "anniversary",
      subscription_at: "2026-08-03T00:00:00Z",
      started_at: "2026-08-03T00:00:00Z",
      ending_at: null,
      canceled_at: null,
      created_at: "2026-08-03T00:00:00Z",
      updated_at: "2026-08-03T00:00:00Z",
    };

    it("uses Core for ensure, reads and Entity checkout", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ entity_subscription: entitySubscription }, 201))
        .mockResolvedValueOnce(jsonResponse({ entity_subscription: entitySubscription }))
        .mockResolvedValueOnce(
          jsonResponse({
            type: "stripe",
            client_secret: "cs_entity",
            external_entity_id: "user/42",
            external_subscription_id: "entity-sub-1",
          }),
        );
      const client = new Nozle({
        apiKey: "sk_test",
        baseUrl: "https://engine.example",
        eventsUrl: "https://core.example",
      });

      await client.entitySubscriptions.ensure("workspace/1", "user/42");
      await client.entitySubscriptions.get("workspace/1", "user/42");
      await client.entitySubscriptions.checkout("workspace/1", "user/42", {
        planCode: "pro",
        returnUrl: "https://wrrk.ai/settings/billing",
        billingTime: "anniversary",
        idempotencyKey: "checkout-user-42-pro",
      });

      expect(fetchMock.mock.calls[0][0]).toBe(
        "https://core.example/api/v1/customers/workspace%2F1/entities/user%2F42/subscription",
      );
      expect(fetchMock.mock.calls[0][1].method).toBe("PUT");
      expect(fetchMock.mock.calls[2][0]).toBe(
        "https://core.example/api/v1/customers/workspace%2F1/entities/user%2F42/subscription/checkout",
      );
      expect(fetchMock.mock.calls[2][1].headers["Idempotency-Key"]).toBe("checkout-user-42-pro");
      expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({
        plan_code: "pro",
        return_url: "https://wrrk.ai/settings/billing",
        billing_time: "anniversary",
      });
    });

    it("cancels with an idempotency key and rejects publishable keys locally", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          entity_subscription: entitySubscription,
          subscription_transition: { id: "transition-1", replayed: false },
        }),
      );
      const client = new Nozle({ apiKey: "sk_test", eventsUrl: "https://core.example" });
      await client.entitySubscriptions.cancel("workspace", "user-42", {
        idempotencyKey: "cancel-user-42",
        timing: "end_of_period",
      });

      expect(fetchMock.mock.calls[0][1].headers["Idempotency-Key"]).toBe("cancel-user-42");

      const browserClient = new Nozle({ apiKey: "pk_browser" });
      await expect(browserClient.entitySubscriptions.get("workspace", "user-42")).rejects.toThrow(
        "requires a secret key",
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("creates one checkout for multiple Entity plans", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          entity_subscription_checkout: {
            id: "batch-1",
            type: "stripe",
            status: "open",
            client_secret: "cs_bulk",
            invoice_id: "invoice-1",
            amount_cents: 4498,
            currency: "USD",
            replayed: false,
            expires_at: "2026-08-07T12:00:00Z",
            items: [
              {
                external_entity_id: "seat-pro-1",
                external_subscription_id: "entity-sub-1",
                plan_code: "pro",
                subscription_status: "incomplete",
              },
            ],
          },
        }),
      );
      const client = new Nozle({ apiKey: "sk_test", eventsUrl: "https://core.example" });

      const result = await client.entitySubscriptions.checkoutMany("workspace/1", {
        billingTime: "anniversary",
        returnUrl: "https://wrrk.ai/settings/billing",
        idempotencyKey: "workspace-1-seat-purchase",
        items: [{ externalEntityId: "seat-pro-1", planCode: "pro" }],
      });

      expect(result.client_secret).toBe("cs_bulk");
      expect(fetchMock.mock.calls[0][0]).toBe(
        "https://core.example/api/v1/customers/workspace%2F1/entity-subscriptions/checkout",
      );
      expect(fetchMock.mock.calls[0][1].headers["Idempotency-Key"]).toBe(
        "workspace-1-seat-purchase",
      );
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
        entity_subscription_checkout: {
          billing_time: "anniversary",
          return_url: "https://wrrk.ai/settings/billing",
          items: [{ external_entity_id: "seat-pro-1", plan_code: "pro" }],
        },
      });
    });

    it("validates bulk Entity checkout before network I/O", async () => {
      const client = new Nozle({ apiKey: "sk_test" });

      await expect(
        client.entitySubscriptions.checkoutMany("workspace", {
          idempotencyKey: "purchase-1",
          items: [
            { externalEntityId: "seat-1", planCode: "pro" },
            { externalEntityId: "seat-1", planCode: "max" },
          ],
        }),
      ).rejects.toThrow("unique externalEntityId");
      await expect(
        new Nozle({ apiKey: "pk_browser" }).entitySubscriptions.checkoutMany("workspace", {
          idempotencyKey: "purchase-1",
          items: [{ externalEntityId: "seat-1", planCode: "pro" }],
        }),
      ).rejects.toThrow("requires a secret key");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
