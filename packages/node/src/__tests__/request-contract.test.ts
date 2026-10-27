import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Nozle } from "../client";

// Every request body the SDK sends must fit the API's request schema.
// contract/openapi_requests.json is written by scripts/sync_openapi_requests.py from
// nozle-openapi.yaml. Each request is matched to its operation by method and path, and its body is
// checked: no key the schema does not have, no null where it is not allowed, enum values only.

interface Schema {
  type?: string | string[];
  enum?: unknown[];
  properties?: Record<string, Schema>;
  items?: Schema;
  allOf?: Schema[];
  oneOf?: Schema[];
  anyOf?: Schema[];
  additionalProperties?: unknown;
}

const operations: Record<string, Schema | null> = JSON.parse(
  readFileSync(join(__dirname, "contract", "openapi_requests.json"), "utf8"),
);
const routes = Object.keys(operations).map((key) => {
  const [method, path] = key.split(" ");
  return { method, key, pattern: new RegExp(`^${path.replace(/\{[^/]+\}/g, "[^/]+")}$`) };
});

function findOperation(method: string, path: string): string | undefined {
  if (`${method} ${path}` in operations) return `${method} ${path}`;
  return routes
    .filter((route) => route.method === method && route.pattern.test(path))
    .sort((a, b) => a.key.split("{").length - b.key.split("{").length)[0]?.key;
}

function problems(value: unknown, schema: Schema | null | undefined, where: string): string[] {
  if (!schema) return [];
  for (const branches of [schema.oneOf, schema.anyOf]) {
    if (!branches?.length) continue;
    const results = branches.map((branch) => problems(value, branch, where));
    return results.some((found) => found.length === 0) ? [] : results.sort((a, b) => a.length - b.length)[0];
  }
  const properties: Record<string, Schema> = { ...schema.properties };
  let kinds = schema.type;
  for (const part of schema.allOf ?? []) {
    Object.assign(properties, part.properties);
    kinds ??= part.type;
  }
  const types = kinds === undefined ? [] : Array.isArray(kinds) ? kinds : [kinds];
  if (value === null) return types.length === 0 || types.includes("null") ? [] : [`${where}: null is not allowed`];
  if (schema.enum && !schema.enum.includes(value)) return [`${where}: ${JSON.stringify(value)} is not one of ${JSON.stringify(schema.enum)}`];
  const found: string[] = [];
  if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(properties).length > 0) {
    for (const [key, item] of Object.entries(value)) {
      if (key in properties) found.push(...problems(item, properties[key], `${where}.${key}`));
      else if (!schema.additionalProperties) found.push(`${where}: unknown key "${key}"`);
    }
  }
  if (Array.isArray(value) && schema.items) value.forEach((item, i) => found.push(...problems(item, schema.items, `${where}[${i}]`)));
  return found;
}

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
afterEach(() => fetchMock.mockReset());

const client = () => new Nozle({ apiKey: "sk_test", baseUrl: "https://api.example/engine", eventsUrl: "https://api.example/core" });

const calls: Record<string, (nozle: Nozle) => Promise<unknown>> = {
  track: (n) => n.track("cust", "api_calls", { tokens: 1 }, { subscriptionId: "sub_1" }),
  "usage.check": (n) => n.usage.check({ customerId: "cust", featureCode: "emails" }),
  "usage.track": (n) => n.usage.track({ customerId: "cust", featureCode: "emails" }, { idempotencyKey: "k1" }),
  "costEvents.track": (n) => n.costEvents.track({ costMeterCode: "llm_tokens", externalCustomerId: "cust" }),
  "customers.upsert": (n) => n.customers.upsert({ externalId: "cust" }),
  subscribe: (n) => n.subscribe("cust", "pro"),
  "subscribe to a plan version": (n) => n.subscribe("cust", "pro", { planVersion: 1 }),
  "planVersions.previewMigration": (n) => n.planVersions.previewMigration("pro", { fromVersion: 1 }),
  "planVersions.createMigration": (n) => n.planVersions.createMigration("pro", { fromVersion: 1, toVersion: 3 }),
  "planVersions.cancelMigration": (n) => n.planVersions.cancelMigration("pro", "mig_1"),
  checkout: (n) => n.checkout("cust", "pro"),
  "entitySubscriptions.checkout": (n) => n.entitySubscriptions.checkout("cust", "user-42", { planCode: "pro", idempotencyKey: "s1" }),
  "entitySubscriptions.changePlan": (n) => n.entitySubscriptions.changePlan("cust", "user-42", { planCode: "team", idempotencyKey: "s2" }),
  "entitySubscriptions.checkoutMany": (n) =>
    n.entitySubscriptions.checkoutMany("cust", { items: [{ externalEntityId: "user-42", planCode: "pro" }], idempotencyKey: "b1" }),
  "entitySubscriptions.cancel": (n) => n.entitySubscriptions.cancel("cust", "user-42", { idempotencyKey: "c1" }),
  "entities.upsert": (n) => n.entities.upsert("cust", "user-42", { status: "active" }, { idempotencyKey: "e1" }),
  "margin.simulate": (n) => n.margin.simulate({ metricCode: "agent_execution", newPriceDollars: 1 }),
  "customers.importCreditBalance": (n) =>
    n.customers.importCreditBalance(
      "cust",
      { externalSubscriptionId: "sub_1", creditSystemCode: "ai_credits", grantedAmount: "500", remainingAmount: "320", dryRun: true },
      { idempotencyKey: "i1" },
    ),
  "customers.importBillingState": (n) =>
    n.customers.importBillingState(
      "cust",
      {
        dryRun: true,
        subscription: {
          planCode: "pro",
          status: "active",
          billingAuthority: "external",
          externalReference: "ext_1",
          currentPeriodStart: "2026-10-15T00:00:00Z",
          currentPeriodEnd: "2026-11-15T00:00:00Z",
        },
      },
      { idempotencyKey: "i2" },
    ),
  "credits.allocate": (n) => n.credits.allocate("cust", "user-42", { creditSystemCode: "ai_credits", amount: "10" }, { idempotencyKey: "a1" }),
};

describe("request bodies fit the API schemas", () => {
  it.each(Object.entries(calls))("%s", async (_name, call) => {
    fetchMock.mockImplementation(async () => new Response("{}", { status: 200 }));
    await call(client()).catch(() => undefined);
    const sent = fetchMock.mock.calls.filter(([, init]) => (init?.method ?? "GET") !== "GET");
    expect(sent.length).toBeGreaterThan(0);
    for (const [url, init] of sent) {
      const method = init.method as string;
      const path = new URL(String(url)).pathname;
      const key = findOperation(method, path);
      expect(key, `${method} ${path} is not an operation in the spec`).toBeDefined();
      const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
      if (body !== undefined) expect(problems(body, operations[key!], key!)).toEqual([]);
    }
  });

  it("rejects null, unknown keys and values outside an enum", () => {
    const key = "POST /core/api/v1/customers/{customer_id}/entity-subscriptions/checkout";
    const found = problems(
      { entity_subscription_checkout: { items: [{ external_entity_id: "u", plan_code: "p" }], billing_time: "", return_url: null, extra: 1 } },
      operations[key],
      key,
    ).join("\n");
    expect(found).toContain("billing_time");
    expect(found).toContain("null is not allowed");
    expect(found).toContain('unknown key "extra"');
  });
});
