// Test-only zero-due upgrade, scheduled downgrade and withdrawal against real services.
// Interactive provider payment scenarios are verified separately in the browser.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const base = process.env.MERCHANT_URL ?? "http://localhost:4242";
const origin = process.env.MERCHANT_ORIGIN ?? base;
const selected = process.env.DEMO_SUBSCRIPTION_ID;
const other = process.env.DEMO_OTHER_SUBSCRIPTION_ID;
const target = process.env.DEMO_UPGRADE_PLAN_CODE;
for (const id of [process.env.DEMO_CUSTOMER_ID, selected, other])
  assert(id?.startsWith("sdk-cancel-test-"), "Use dedicated sdk-cancel-test-* fixtures");
assert(target, "Set DEMO_UPGRADE_PLAN_CODE to a configured zero-due upgrade target");
let cookie = "";
async function post(path, body, expected = 200) {
  const response = await fetch(base + path, { method: "POST", headers: {
    Origin: origin, "Content-Type": "application/json", ...(cookie && { Cookie: cookie }),
  }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
  assert.equal(response.status, expected, `${path} returned HTTP ${response.status}`);
  if (path === "/api/login") cookie = response.headers.get("set-cookie").split(";")[0];
  return response.json();
}
const plans = (name, body, status) => post(`/api/billing/plans/${name}`, body, status);
const state = subscriptionId => plans("status", { subscriptionId });
await post("/api/billing/plans/load", { subscriptionId: selected }, 401);
await post("/api/login", { token: process.env.DEMO_LOGIN_TOKEN });
const before = await state(selected);
const untouchedBefore = await state(other);
assert.equal(before.pendingChange, null);
assert.equal(before.endingAt, null);
assert(before.eligiblePlans.some(plan => plan.code === target && plan.operation === "upgrade"));
const preview = await plans("preview", { subscriptionId: selected, targetPlanCode: target });
assert.equal(BigInt(preview.amountDueNowCents), 0n, "This automated driver only permits zero-due upgrades");
assert.equal(preview.operation, "upgrade");
const upgrade = { subscriptionId: selected, targetPlanCode: target, quoteToken: preview.quoteToken,
  idempotencyKey: randomUUID(), returnUrl: `${origin}/` };
await plans("apply", { ...upgrade, customerId: "other-customer" }, 400);
await plans("apply", upgrade);
await plans("apply", upgrade);
const upgraded = await state(selected);
assert.equal(upgraded.currentPlan.code, target);
assert.equal(upgraded.status, "active");
assert.equal((await state(other)).currentPlan.code, untouchedBefore.currentPlan.code);
const lower = before.currentPlan.code;
assert(upgraded.eligiblePlans.some(plan => plan.code === lower && plan.operation === "downgrade"));
const lowerPreview = await plans("preview", { subscriptionId: selected, targetPlanCode: lower });
assert.equal(lowerPreview.operation, "downgrade");
assert.equal(lowerPreview.timing, "end_of_period");
const downgrade = { ...upgrade, targetPlanCode: lower, quoteToken: lowerPreview.quoteToken, idempotencyKey: randomUUID() };
await plans("apply", downgrade);
await plans("apply", downgrade);
const scheduled = await state(selected);
assert.equal(scheduled.currentPlan.code, target);
assert.equal(scheduled.pendingChange.plan.code, lower);
assert.equal(Date.parse(scheduled.pendingChange.effectiveAt), Date.parse(lowerPreview.effectiveAt));
await plans("withdraw", { subscriptionId: selected, pendingChangeId: "00000000-0000-0000-0000-000000000000", idempotencyKey: randomUUID() }, 409);
const withdraw = { subscriptionId: selected, pendingChangeId: scheduled.pendingChange.id, idempotencyKey: randomUUID() };
await plans("withdraw", withdraw);
await plans("withdraw", withdraw);
const final = await state(selected);
assert.equal(final.pendingChange, null);
assert.equal(final.currentPlan.code, target);
assert.equal(final.endingAt, null);
assert.equal((await state(other)).currentPlan.code, untouchedBefore.currentPlan.code);
console.log(JSON.stringify({ result: "passed", subscriptionId: selected, otherSubscriptionId: other,
  finalPlan: final.currentPlan.code, finalStatus: final.status, pendingChange: null,
  checks: ["authenticated subscription selection", "zero-due upgrade and replay", "other subscription unchanged", "scheduled downgrade and replay", "stale withdrawal rejected", "exact withdrawal and replay"] }));
