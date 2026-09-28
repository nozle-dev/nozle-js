import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { createServer } from "node:http";
import { Nozle } from "@nozle-js/node";
import {
  ActionStore,
  createBillingService,
  createMerchantServer,
  portalSessionReader,
} from "./server.mjs";

const cleanup = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0)) await fn();
});
const effectiveAt = "2027-01-01T00:00:00.123456Z";
const cancellation = {
  subscriptionId: "external-subscription",
  operation: "cancel",
  expectedEffectiveAt: effectiveAt,
  idempotencyKey: "confirmation-1",
};
function fixture(overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), "nozle-merchant-"));
  cleanup.push(() => rmSync(dir, { recursive: true }));
  const calls = [];
  const sdk = {
    async previewSubscriptionTransition(params) {
      calls.push(["preview", params]);
      return {
        subscription_transition: {
          operation: params.operation,
          effective_at: effectiveAt,
          renewal_at: effectiveAt,
        },
      };
    },
    async applySubscriptionTransition(params, key) {
      calls.push(["apply", params, key]);
      return {};
    },
    ...overrides,
  };
  const path = join(dir, "actions.json");
  const make = () =>
    createBillingService({
      sdk,
      store: new ActionStore(path),
      createPortalSession: async (customerId) => ({
        token: `scoped-${customerId}`,
        apiUrl: "http://core",
      }),
    });
  return { dispatch: make(), calls, make };
}
test("cancel previews then applies explicit period-end policy; replay survives server restart", async () => {
  const { dispatch, calls, make } = fixture();
  await dispatch("authenticated", "/api/billing/cancellation", cancellation);
  await make()("authenticated", "/api/billing/cancellation", cancellation);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1][1], {
    customerId: "authenticated",
    subscriptionId: "external-subscription",
    operation: "cancel",
    timing: "end_of_period",
    expectedEffectiveAt: effectiveAt,
  });
  await assert.rejects(
    dispatch("authenticated", "/api/billing/cancellation", {
      ...cancellation,
      subscriptionId: "another",
    }),
    { status: 409 },
  );
});
test("concurrent duplicate confirmations apply once", async () => {
  const { dispatch, calls } = fixture();
  await Promise.all(
    Array.from({ length: 4 }, () =>
      dispatch("authenticated", "/api/billing/cancellation", cancellation),
    ),
  );
  assert.equal(calls.filter(([type]) => type === "apply").length, 1);
});
test("lost upstream responses retry with the identical key without a new preview", async () => {
  const keys = [];
  const { dispatch, make, calls } = fixture({
    async applySubscriptionTransition(_, key) {
      keys.push(key);
      if (keys.length === 1) throw new Error("timeout with private detail");
      return {};
    },
  });
  await assert.rejects(
    dispatch("authenticated", "/api/billing/cancellation", cancellation),
  );
  await make()("authenticated", "/api/billing/cancellation", cancellation);
  assert.equal(keys[0], keys[1]);
  assert.equal(calls.length, 1);
});
test("changed date is rejected before mutation and requires renewed confirmation", async () => {
  const { dispatch, calls } = fixture();
  await assert.rejects(
    dispatch("authenticated", "/api/billing/cancellation", {
      ...cancellation,
      expectedEffectiveAt: "2026-12-01T00:00:00Z",
    }),
    { status: 409 },
  );
  assert.equal(calls.length, 1);
});
test("atomic upstream conflict maps to changed without exposing upstream details", async () => {
  const { dispatch } = fixture({
    async applySubscriptionTransition() {
      throw new Error("applySubscriptionTransition failed: 409 Conflict");
    },
  });
  await assert.rejects(
    dispatch("authenticated", "/api/billing/cancellation", cancellation),
    {
      status: 409,
      message: "Subscription changed. Preview and confirm again.",
    },
  );
});
test("keep uses uncancel with no settlement overrides", async () => {
  const { dispatch, calls } = fixture();
  await dispatch("authenticated", "/api/billing/cancellation", {
    subscriptionId: "external-subscription",
    operation: "uncancel",
    idempotencyKey: "keep-1",
  });
  assert.deepEqual(calls[1][1], {
    customerId: "authenticated",
    subscriptionId: "external-subscription",
    operation: "uncancel",
  });
});
test("rejects customer tampering, privileged options, unsupported operations and missing confirmation date", async () => {
  const { dispatch, calls } = fixture();
  for (const body of [
    { ...cancellation, customerId: "victim" },
    { ...cancellation, timing: "immediate" },
    { ...cancellation, operation: "downgrade" },
    { ...cancellation, expectedEffectiveAt: undefined },
    { ...cancellation, operation: "uncancel" },
  ]) {
    await assert.rejects(
      dispatch("authenticated", "/api/billing/cancellation", body),
      { status: 400 },
    );
  }
  assert.equal(calls.length, 0);
});
test("same client key is independently scoped to authenticated customer", async () => {
  const { dispatch, calls } = fixture();
  await dispatch("first", "/api/billing/cancellation", cancellation);
  await dispatch("second", "/api/billing/cancellation", cancellation);
  assert.notEqual(calls[1][2], calls[3][2]);
});
test("portal session uses authenticated customer and returns only scoped public session fields", async () => {
  let request;
  const read = portalSessionReader({
    apiKey: "sk_private",
    coreUrl: "http://core",
    portalApiUrl: "https://browser-core",
    fetcher: async (url, options) => {
      request = [url, options];
      return {
        ok: true,
        json: async () => ({
          customer: { portal_url: "https://host/customer-portal/public-token" },
        }),
      };
    },
  });
  assert.deepEqual(await read("cust/a"), {
    token: "public-token",
    apiUrl: "https://browser-core",
  });
  assert.equal(request[0], "http://core/api/v1/customers/cust%2Fa/portal_url");
  assert.equal(request[1].headers.Authorization, "Bearer sk_private");
});
test("merchant calls the actual SDK with the documented nested Engine response and wire policy", async () => {
  const wire = [];
  const api = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    wire.push({
      path: req.url,
      body: JSON.parse(body),
      key: req.headers["idempotency-key"],
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        subscription_transition: {
          operation: "cancel",
          effective_at: effectiveAt,
          renewal_at: effectiveAt,
        },
      }),
    );
  });
  await new Promise((resolve) => api.listen(0, "127.0.0.1", resolve));
  cleanup.push(
    () =>
      new Promise((resolve) => {
        api.closeAllConnections();
        api.close(resolve);
      }),
  );
  const dir = mkdtempSync(join(tmpdir(), "nozle-sdk-wire-"));
  cleanup.push(() => rmSync(dir, { recursive: true }));
  const dispatch = createBillingService({
    sdk: new Nozle({
      apiKey: "sk_example",
      baseUrl: `http://127.0.0.1:${api.address().port}`,
    }),
    store: new ActionStore(join(dir, "actions.json")),
    createPortalSession: async () => ({}),
  });
  await dispatch("authenticated", "/api/billing/cancellation", cancellation);
  assert.deepEqual(
    wire.map(({ path }) => path),
    [
      "/api/v1/subscriptions/transitions/preview",
      "/api/v1/subscriptions/transitions",
    ],
  );
  assert.deepEqual(wire[1].body, {
    customer_id: "authenticated",
    subscription_id: "external-subscription",
    operation: "cancel",
    timing: "end_of_period",
    expected_effective_at: effectiveAt,
  });
  assert.match(wire[1].key, /^[a-f0-9]{64}$/);
});
test("HTTP requires login, same-origin JSON, expires sessions, and redacts upstream errors", async () => {
  let clock = 1;
  const { dispatch } = fixture();
  const origin = "http://localhost:4242";
  const loginToken = "x".repeat(32);
  const server = createMerchantServer({
    origin,
    loginToken,
    customerId: "authenticated",
    dispatch: async (...args) => {
      if (args[1] === "/api/private-failure")
        throw new Error("sk_secret customer-portal/token");
      return dispatch(...args);
    },
    now: () => clock,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanup.push(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body = {}, headers = {}) =>
    fetch(base + path, {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
    });
  assert.equal((await post("/api/billing/session")).status, 401);
  assert.equal(
    (
      await post(
        "/api/login",
        { token: loginToken },
        { Origin: "https://evil.example" },
      )
    ).status,
    403,
  );
  assert.equal((await post("/api/login", { token: "wrong" })).status, 401);
  const login = await post("/api/login", { token: loginToken });
  const cookie = login.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly; SameSite=Strict/);
  assert.match(cookie, /; Secure;/);
  const headers = { Cookie: cookie.split(";")[0] };
  assert.deepEqual(
    await (await post("/api/billing/session", {}, headers)).json(),
    { token: "scoped-authenticated", apiUrl: "http://core" },
  );
  assert.equal(
    (await post("/api/billing/session", { customerId: "victim" }, headers))
      .status,
    400,
  );
  const failure = await post("/api/private-failure", {}, headers);
  assert.equal(failure.status, 502);
  assert.doesNotMatch(await failure.text(), /sk_secret|customer-portal/);
  clock += 3_600_001;
  assert.equal((await post("/api/billing/session", {}, headers)).status, 401);
});
