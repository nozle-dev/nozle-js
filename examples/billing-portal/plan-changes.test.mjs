import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { ActionStore, createBillingService } from "./server.mjs";

const cleanups = [];
afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
const lower = {
  code: "basic",
  name: "Basic",
  amount_cents: "500",
  currency: "JPY",
  interval: "monthly",
};
const pro = { ...lower, code: "pro", name: "Pro", amount_cents: "1500" };
const applyBody = {
  subscriptionId: "external",
  targetPlanCode: "pro",
  quoteToken: "opaque.quote",
  idempotencyKey: "confirm",
  returnUrl: "https://merchant.example/billing",
};
function fixture(overrides = {}, configuration = {}) {
  const directory = mkdtempSync(join(tmpdir(), "nozle-plan-"));
  cleanups.push(() => rmSync(directory, { recursive: true }));
  let options = {
    subscription: {
      id: "internal",
      external_id: "external",
      plan_code: "basic",
      status: "active",
      ending_at: null,
      plan: lower,
    },
    pending_change: null,
    eligible_plans: [{ ...pro, direction: "upgrade", timing: "immediate" }],
    checkout: null,
  };
  const calls = [];
  const sdk = {
    async subscriptionOptions(...args) {
      calls.push(["options", ...args]);
      return options;
    },
    async previewSubscriptionChange(...args) {
      calls.push(["preview", ...args]);
      return {
        transition_direction: "upgrade",
        timing: "immediate",
        currency: "JPY",
        credit_amount_cents: "0",
        debit_amount_cents: "900719925474099300",
        net_amount_cents: "900719925474099300",
        amount_due_now_cents: "900719925474099300",
        amount_due_at_effective_cents: "0",
        effective_at: "2030-01-01T00:00:00.123456Z",
        renewal_at: null,
        quote_id: "opaque.quote",
      };
    },
    async checkout(...args) {
      calls.push(["checkout", ...args]);
      return {
        type: "stripe",
        client_secret: "customer-payment-secret",
        publishable_key: "pk_public",
        checkout_id: "intent",
      };
    },
    async applySubscriptionTransition(...args) {
      calls.push(["transition", ...args]);
      return {
        subscription_transition: {
          status: "pending",
          plan_code: "basic",
          subscription_id: "pending-internal",
          effective_at: "2030-01-01T00:00:00.123456Z",
          currency: "JPY",
        },
      };
    },
    async withdrawPendingSubscriptionChange(...args) {
      calls.push(["withdraw", ...args]);
      return {};
    },
    async checkoutStatus(...args) {
      calls.push(["status", ...args]);
      return {
        status: "awaiting_payment",
        checkout: { type: "stripe", client_secret: "customer-payment-secret" },
      };
    },
    async verifyCheckout(...args) {
      calls.push(["verify", ...args]);
      return { status: "processing" };
    },
    ...overrides,
  };
  const make = () =>
    createBillingService({
      sdk,
      store: new ActionStore(join(directory, "actions.json")),
      createPortalSession: async () => ({}),
      returnOrigin: "https://merchant.example",
      ...configuration,
    });
  return {
    dispatch: make(),
    make,
    calls,
    setOptions: (value) => {
      options = value;
    },
    getOptions: () => options,
  };
}
const route = (name) => `/api/billing/plans/${name}`;
test("load uses server eligibility and preserves integer strings; preview preserves quote precision", async () => {
  const f = fixture();
  // Direction is policy-owned: this intentionally lower priced target is still an upgrade.
  f.setOptions({
    ...f.getOptions(),
    eligible_plans: [
      {
        ...pro,
        amount_cents: "100",
        direction: "upgrade",
        timing: "immediate",
      },
    ],
  });
  const state = await f.dispatch("authenticated", route("load"), {
    subscriptionId: "external",
  });
  assert.equal(state.eligiblePlans[0].operation, "upgrade");
  assert.equal(state.eligiblePlans[0].amountCents, "100");
  const preview = await f.dispatch("authenticated", route("preview"), {
    subscriptionId: "external",
    targetPlanCode: "pro",
  });
  assert.equal(preview.amountDueNowCents, "900719925474099300");
  assert.equal(preview.effectiveAt, "2030-01-01T00:00:00.123456Z");
  assert.equal(preview.quoteToken, "opaque.quote");
});
test("upgrade calls payment checkout with exact selection and replays after restart", async () => {
  const f = fixture();
  const result = await f.dispatch("authenticated", route("apply"), applyBody);
  const replay = await f.make()("authenticated", route("apply"), {
    ...applyBody,
  });
  assert.deepEqual(replay, result);
  const call = f.calls.find(([kind]) => kind === "checkout");
  assert.deepEqual(call.slice(1, 4), [
    "authenticated",
    "pro",
    "https://merchant.example/billing",
  ]);
  assert.equal(call[4].subscriptionId, "external");
  assert.equal(call[4].quoteId, "opaque.quote");
  assert.equal(f.calls.filter(([kind]) => kind === "checkout").length, 1);
  assert.equal(f.getOptions().subscription.plan_code, "basic");
});
test("lost checkout response retries the same key without rechecking a newly pending checkout", async () => {
  const keys = [];
  const f = fixture({
    async checkout(...args) {
      keys.push(args[3].idempotencyKey);
      if (keys.length === 1) throw new Error("timeout");
      return {
        type: "processing",
        checkout_id: "intent",
        status: "processing",
      };
    },
  });
  await assert.rejects(f.dispatch("authenticated", route("apply"), applyBody));
  f.setOptions({
    ...f.getOptions(),
    checkout: { id: "intent", status: "pending" },
    eligible_plans: [],
  });
  await f.make()("authenticated", route("apply"), applyBody);
  assert.equal(keys[0], keys[1]);
  assert.equal(f.calls.filter(([kind]) => kind === "options").length, 1);
});
test("downgrade uses existing quoted transition at period end and withdrawal targets exact pending ID", async () => {
  const f = fixture();
  f.setOptions({
    ...f.getOptions(),
    subscription: {
      ...f.getOptions().subscription,
      plan: pro,
      plan_code: "pro",
    },
    eligible_plans: [
      { ...lower, direction: "downgrade", timing: "end_of_period" },
    ],
  });
  const result = await f.dispatch("authenticated", route("apply"), {
    ...applyBody,
    targetPlanCode: "basic",
  });
  assert.equal(result.type, "scheduled");
  assert.equal(result.effective_at, "2030-01-01T00:00:00.123456Z");
  assert.deepEqual(f.calls.find(([kind]) => kind === "transition")[1], {
    customerId: "authenticated",
    subscriptionId: "external",
    operation: "downgrade",
    targetPlanCode: "basic",
    timing: "end_of_period",
    billingAnchor: "keep_anchor",
    quoteId: "opaque.quote",
  });
  const withdrawal = {
    subscriptionId: "external",
    pendingChangeId: "pending-internal",
    idempotencyKey: "withdraw",
  };
  await f.dispatch("authenticated", route("withdraw"), withdrawal);
  await f.make()("authenticated", route("withdraw"), withdrawal);
  assert.deepEqual(f.calls.find(([kind]) => kind === "withdraw").slice(1, 4), [
    "authenticated",
    "external",
    "pending-internal",
  ]);
  assert.equal(f.calls.filter(([kind]) => kind === "withdraw").length, 1);
});
test("rejects identity, privileged policy, external redirects and stale selection", async () => {
  const f = fixture();
  for (const body of [
    { ...applyBody, customerId: "victim" },
    { ...applyBody, timing: "immediate" },
    { ...applyBody, returnUrl: "https://attacker.example/" },
    { ...applyBody, quoteToken: "" },
  ])
    await assert.rejects(f.dispatch("authenticated", route("apply"), body), {
      status: 400,
    });
  f.setOptions({
    ...f.getOptions(),
    subscription: {
      ...f.getOptions().subscription,
      ending_at: "2030-01-01T00:00:00Z",
    },
  });
  await assert.rejects(f.dispatch("authenticated", route("apply"), applyBody), {
    status: 409,
  });
  assert.equal(f.calls.filter(([kind]) => kind === "checkout").length, 0);
});
test("status and Razorpay verification bind checkout to authenticated customer and subscription", async () => {
  const f = fixture();
  f.setOptions({
    ...f.getOptions(),
    checkout: { id: "intent", status: "pending", plan_code: "pro" },
  });
  const state = await f.dispatch("authenticated", route("status"), {
    subscriptionId: "external",
  });
  assert.equal(state.checkoutStatus, "awaiting_payment");
  assert.equal(state.checkout.type, "stripe");
  const verification = {
    razorpay_order_id: "order",
    razorpay_payment_id: "payment",
    razorpay_signature: "signature",
  };
  await f.dispatch("authenticated", route("checkout-verify"), {
    subscriptionId: "external",
    checkoutId: "intent",
    verification,
  });
  assert.deepEqual(f.calls.find(([kind]) => kind === "status").slice(1), [
    "intent",
    { customerId: "authenticated", subscriptionId: "external" },
  ]);
  assert.deepEqual(f.calls.find(([kind]) => kind === "verify").slice(1), [
    "intent",
    verification,
    { customerId: "authenticated", subscriptionId: "external" },
  ]);
});
test("atomic quote conflicts return a safe 409", async () => {
  const f = fixture({
    async checkout() {
      throw new Error("checkout failed: 409 Conflict");
    },
  });
  await assert.rejects(f.dispatch("authenticated", route("apply"), applyBody), {
    status: 409,
    message: "Your plan or quote changed. Refresh and confirm again.",
  });
});

test("embedded Stripe uses only a configured publishable key and keeps hosted checkout preferred", async () => {
  const f = fixture(
    {
      async checkout() {
        return { type: "stripe", client_secret: "customer-secret" };
      },
    },
    { stripePublishableKey: "pk_test_public" },
  );
  assert.equal(
    (await f.dispatch("authenticated", route("apply"), applyBody))
      .publishable_key,
    "pk_test_public",
  );
  const hosted = fixture(
    {
      async checkout() {
        return { type: "stripe", url: "https://checkout.stripe.com/example" };
      },
    },
    { stripePublishableKey: "pk_test_public" },
  );
  assert.equal(
    (await hosted.dispatch("authenticated", route("apply"), applyBody))
      .publishable_key,
    undefined,
  );
  assert.throws(
    () => fixture({}, { stripePublishableKey: "sk_secret" }),
    /publishable key/,
  );
});
