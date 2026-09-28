import { createHash } from "node:crypto";

export class PlanError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
function fields(body, allowed) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => !allowed.includes(key))
  )
    throw new PlanError(400, "Invalid plan change fields.");
}
function value(input, name, maximum = 255) {
  if (
    typeof input !== "string" ||
    !input.trim() ||
    Buffer.byteLength(input) > maximum
  )
    throw new PlanError(400, `Invalid ${name}.`);
  return input;
}
function plan(input) {
  return {
    code: input.code,
    name: input.name,
    amountCents: input.amount_cents,
    currency: input.currency,
    interval: input.interval,
  };
}
function checkoutStatus(status) {
  return (
    {
      pending: "awaiting_payment",
      applied: "succeeded",
      payment_failed: "failed",
      canceled: "failed",
    }[status] ?? status
  );
}
const supportedStatuses = new Set([
  "none",
  "awaiting_payment",
  "processing",
  "succeeded",
  "failed",
  "expired",
  "needs_review",
]);

export function createPlanService({
  sdk,
  store,
  returnOrigin,
  stripePublishableKey,
}) {
  if (stripePublishableKey && !/^pk_(test|live)_/.test(stripePublishableKey))
    throw new Error("STRIPE_PUBLISHABLE_KEY must be a Stripe publishable key");
  const payment = (result) =>
    result?.type === "stripe" &&
    !result.url &&
    !result.publishable_key &&
    stripePublishableKey
      ? { ...result, publishable_key: stripePublishableKey }
      : result;
  async function load(customerId, subscriptionId) {
    const options = await sdk.subscriptionOptions(customerId, subscriptionId);
    let status = options.checkout
      ? checkoutStatus(options.checkout.status)
      : "none";
    let checkout = null;
    if (options.checkout) {
      const current = await sdk.checkoutStatus(options.checkout.id, {
        customerId,
        subscriptionId,
      });
      status = checkoutStatus(current.status);
      if (["awaiting_payment", "processing"].includes(status))
        checkout = payment(current.checkout) ?? null;
    }
    if (!supportedStatuses.has(status)) status = "needs_review";
    return {
      subscriptionId: options.subscription.external_id,
      status: options.subscription.status,
      currentPlan: plan(options.subscription.plan),
      endingAt: options.subscription.ending_at,
      pendingChange: options.pending_change
        ? {
            id: options.pending_change.id,
            plan: plan(options.pending_change.plan),
            effectiveAt: options.pending_change.effective_at,
          }
        : null,
      eligiblePlans: options.eligible_plans.map((item) => ({
        ...plan(item),
        operation: item.direction,
      })),
      blockedReason:
        options.blocked_reason ??
        (options.subscription.ending_at
          ? "Resolve your scheduled cancellation before changing plans."
          : options.pending_change
            ? "Withdraw your pending plan change before choosing another plan."
            : ["awaiting_payment", "processing", "needs_review"].includes(
                  status,
                )
              ? "Resolve your existing checkout before changing plans."
              : null),
      checkoutStatus: status,
      checkout,
    };
  }
  async function once(customerId, body, operation, prepare, apply) {
    const clientKey = value(body.idempotencyKey, "idempotency key");
    const key = createHash("sha256")
      .update(JSON.stringify([customerId, clientKey]))
      .digest("hex");
    const fingerprint = JSON.stringify([
      operation,
      body.subscriptionId,
      body.targetPlanCode ?? null,
      body.quoteToken ?? null,
      body.pendingChangeId ?? null,
      body.returnUrl ?? null,
    ]);
    return store.exclusive(key, async () => {
      let entry = store.entries[key];
      if (entry && entry.fingerprint !== fingerprint)
        throw new PlanError(409, "Idempotency key already used.");
      if (entry?.complete) return entry.result;
      if (!entry) {
        entry = { fingerprint, complete: false, context: await prepare() };
        store.save(key, entry);
      }
      const result = await apply(key, entry.context);
      store.save(key, { ...entry, complete: true, result });
      return result;
    });
  }
  return async (customerId, path, body) => {
    try {
      const action = path.slice("/api/billing/plans/".length);
      if (action === "load" || action === "status") {
        fields(body, ["subscriptionId"]);
        return await load(
          customerId,
          value(body.subscriptionId, "subscription ID"),
        );
      }
      if (action === "preview") {
        fields(body, ["subscriptionId", "targetPlanCode"]);
        const current = await sdk.previewSubscriptionChange(
          customerId,
          value(body.subscriptionId, "subscription ID"),
          value(body.targetPlanCode, "target plan"),
        );
        return {
          operation: current.transition_direction,
          timing: current.timing,
          currency: current.currency,
          creditAmountCents: current.credit_amount_cents,
          debitAmountCents: current.debit_amount_cents,
          netAmountCents: current.net_amount_cents,
          amountDueNowCents: current.amount_due_now_cents,
          amountDueAtEffectiveCents: current.amount_due_at_effective_cents,
          effectiveAt: current.effective_at,
          renewalAt: current.renewal_at,
          quoteToken: current.quote_id,
        };
      }
      if (action === "apply") {
        fields(body, [
          "subscriptionId",
          "targetPlanCode",
          "quoteToken",
          "idempotencyKey",
          "returnUrl",
        ]);
        const subscriptionId = value(body.subscriptionId, "subscription ID");
        const targetPlanCode = value(body.targetPlanCode, "target plan");
        const quoteId = value(body.quoteToken, "quote", 16_384);
        let returnUrl;
        try {
          returnUrl = new URL(value(body.returnUrl, "return URL", 2048));
        } catch {
          throw new PlanError(400, "Invalid return URL.");
        }
        if (
          returnUrl.origin !== returnOrigin ||
          returnUrl.username ||
          returnUrl.password
        )
          throw new PlanError(400, "Return URL must use the merchant origin.");
        return await once(
          customerId,
          body,
          "change",
          async () => {
            const state = await load(customerId, subscriptionId);
            const target = state.eligiblePlans.find(
              (item) => item.code === targetPlanCode,
            );
            if (state.blockedReason || !target)
              throw new PlanError(
                409,
                "Plan change is no longer available. Refresh your subscription.",
              );
            return { operation: target.operation };
          },
          async (key, context) => {
            if (context.operation === "downgrade") {
              const result = await sdk.applySubscriptionTransition(
                {
                  customerId,
                  subscriptionId,
                  operation: "downgrade",
                  targetPlanCode,
                  timing: "end_of_period",
                  billingAnchor: "keep_anchor",
                  quoteId,
                },
                key,
              );
              const changed = result.subscription_transition;
              return {
                type: "scheduled",
                status: changed.status,
                subscription_id: changed.subscription_id,
                pending_subscription_id: changed.subscription_id,
                external_subscription_id: subscriptionId,
                plan_code: changed.plan_code,
                effective_at: changed.effective_at,
                currency: changed.currency,
              };
            }
            return payment(
              await sdk.checkout(customerId, targetPlanCode, returnUrl.href, {
                subscriptionId,
                quoteId,
                idempotencyKey: key,
              }),
            );
          },
        );
      }
      if (action === "withdraw") {
        fields(body, ["subscriptionId", "pendingChangeId", "idempotencyKey"]);
        const subscriptionId = value(body.subscriptionId, "subscription ID");
        const pendingId = value(body.pendingChangeId, "pending change ID");
        return await once(
          customerId,
          body,
          "withdraw",
          async () => null,
          async (key) => {
            await sdk.withdrawPendingSubscriptionChange(
              customerId,
              subscriptionId,
              pendingId,
              key,
            );
            return {};
          },
        );
      }
      if (action === "checkout-status" || action === "checkout-verify") {
        fields(
          body,
          action === "checkout-status"
            ? ["subscriptionId", "checkoutId"]
            : ["subscriptionId", "checkoutId", "verification"],
        );
        const scope = {
          customerId,
          subscriptionId: value(body.subscriptionId, "subscription ID"),
        };
        const checkoutId = value(body.checkoutId, "checkout ID");
        if (action === "checkout-status")
          return await sdk.checkoutStatus(checkoutId, scope);
        fields(body.verification, [
          "razorpay_order_id",
          "razorpay_payment_id",
          "razorpay_signature",
        ]);
        for (const name of [
          "razorpay_order_id",
          "razorpay_payment_id",
          "razorpay_signature",
        ])
          value(body.verification[name], name);
        return await sdk.verifyCheckout(checkoutId, body.verification, scope);
      }
      throw new PlanError(404, "Not found.");
    } catch (error) {
      if (error instanceof PlanError) throw error;
      const status =
        /^(?:subscriptionManagement|checkout|applySubscriptionTransition) failed: (\d+)/.exec(
          error.message,
        )?.[1];
      if (status === "409")
        throw new PlanError(
          409,
          "Your plan or quote changed. Refresh and confirm again.",
        );
      if (status === "404")
        throw new PlanError(404, "Subscription or checkout not found.");
      throw error;
    }
  };
}
