// Mutates only an explicitly named dedicated fixture; leaves it active and renewing.
// Both the Node and Python merchant examples implement this same HTTP contract.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const base = process.env.MERCHANT_URL ?? "http://localhost:4242";
const origin = process.env.MERCHANT_ORIGIN ?? base;
const externalId = process.env.DEMO_SUBSCRIPTION_ID;
assert(
  externalId?.startsWith("sdk-cancel-test-"),
  "Use a dedicated sdk-cancel-test-* fixture",
);
assert(
  process.env.DEMO_CUSTOMER_ID?.startsWith("sdk-cancel-test-"),
  "Use a dedicated sdk-cancel-test-* customer",
);
let cookie = "";
async function post(path, body, status = 200) {
  const response = await fetch(base + path, {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      ...(cookie && { Cookie: cookie }),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  assert.equal(
    response.status,
    status,
    `${path} returned HTTP ${response.status}`,
  );
  if (path === "/api/login")
    cookie = response.headers.get("set-cookie").split(";")[0];
  return response.json();
}
await post("/api/billing/session", {}, 401);
await post("/api/login", { token: process.env.DEMO_LOGIN_TOKEN });
const session = await post("/api/billing/session", {});
async function state() {
  const response = await fetch(session.apiUrl.replace(/\/$/, "") + "/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "customer-portal-token": session.token,
    },
    body: JSON.stringify({
      query: `query { customerPortalSubscriptions(status: [active], limit: 100) {
      collection { id externalId status endingAt plan { code } nextPlan { code } } } }`,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  assert.equal(response.status, 200, "Portal GraphQL failed");
  const data = await response.json();
  assert(!data.errors, "Portal GraphQL rejected state read");
  const found = data.data.customerPortalSubscriptions.collection.find(
    (sub) => sub.externalId === externalId,
  );
  assert(
    found,
    "Dedicated subscription not found in authenticated customer's portal",
  );
  return found;
}
const before = await state();
assert.equal(
  before.endingAt,
  null,
  "Fixture must start renewing; do not modify an existing cancellation",
);
assert.equal(
  before.nextPlan,
  null,
  "Fixture must not have an existing pending plan change",
);
const preview = await post("/api/billing/cancellation/preview", {
  subscriptionId: externalId,
  operation: "cancel",
});
const cancel = {
  subscriptionId: externalId,
  operation: "cancel",
  expectedEffectiveAt: preview.effectiveAt,
  idempotencyKey: randomUUID(),
};
await post(
  "/api/billing/cancellation",
  { ...cancel, customerId: "other-customer" },
  400,
);
await post(
  "/api/billing/cancellation",
  { ...cancel, expectedEffectiveAt: "2000-01-01T00:00:00Z" },
  409,
);
try {
  await post("/api/billing/cancellation", cancel);
  await post("/api/billing/cancellation", cancel);
  const canceled = await state();
  assert.equal(Date.parse(canceled.endingAt), Date.parse(preview.effectiveAt));
  assert.equal(canceled.plan.code, before.plan.code);
  assert.equal(canceled.status, "active");
} finally {
  // Test-owned fixtures are intentionally restored; protected demo data is never selected.
  if ((await state()).endingAt) {
    const keep = {
      subscriptionId: externalId,
      operation: "uncancel",
      idempotencyKey: randomUUID(),
    };
    await post("/api/billing/cancellation", keep);
    await post("/api/billing/cancellation", keep);
  }
}
const after = await state();
assert.equal(after.endingAt, null);
assert.equal(after.plan.code, before.plan.code);
assert.equal(after.status, "active");
console.log(
  JSON.stringify({
    result: "passed",
    subscriptionId: externalId,
    plan: after.plan.code,
    finalStatus: after.status,
    endingAt: after.endingAt,
    checks: [
      "authenticated session",
      "tampering rejected",
      "stale quote rejected",
      "cancel persisted",
      "replay",
      "keep persisted",
    ],
  }),
);
