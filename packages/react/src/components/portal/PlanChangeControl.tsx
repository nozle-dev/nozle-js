"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Checkout } from "../billing/Checkout.js";
import { UpgradeModal } from "../billing/UpgradeModal.js";
import { formatBillingDate, formatMinorAmount } from "../billing/amounts.js";
import type {
  CheckoutResult,
  CheckoutStatus,
  RazorpayVerification,
} from "../../provider.js";
import { BillingPortalError } from "./client.js";

export interface PortalPlan {
  code: string;
  name: string;
  amountCents: string | number;
  currency: string;
  interval: string;
}
export type PlanChangeOperation = "upgrade" | "downgrade";
export interface PlanChangeState {
  subscriptionId: string;
  status: string;
  currentPlan: PortalPlan;
  endingAt: string | null;
  pendingChange: { id: string; plan: PortalPlan; effectiveAt: string } | null;
  eligiblePlans: Array<PortalPlan & { operation: PlanChangeOperation }>;
  blockedReason: string | null;
  checkout: CheckoutResult | null;
  checkoutStatus:
    | "none"
    | "awaiting_payment"
    | "processing"
    | "succeeded"
    | "failed"
    | "expired"
    | "needs_review";
}
export interface PlanChangePreview {
  operation: PlanChangeOperation;
  timing: "immediate" | "end_of_period";
  currency: string;
  creditAmountCents: string | number;
  debitAmountCents: string | number;
  netAmountCents: string | number;
  amountDueNowCents: string | number;
  amountDueAtEffectiveCents: string | number;
  effectiveAt: string;
  renewalAt: string | null;
  quoteToken: string;
}
export interface PlanChangeInput {
  subscriptionId: string;
  signal: AbortSignal;
}
export interface PlanChangePreviewInput extends PlanChangeInput {
  targetPlanCode: string;
}
export interface PlanChangeApplyInput extends PlanChangePreviewInput {
  quoteToken: string;
  idempotencyKey: string;
  returnUrl: string;
}
export interface PlanChangeWithdrawInput extends PlanChangeInput {
  pendingChangeId: string;
  idempotencyKey: string;
}
export interface PlanChangeActions {
  load: (input: PlanChangeInput) => Promise<PlanChangeState>;
  status: (input: PlanChangeInput) => Promise<PlanChangeState>;
  preview: (input: PlanChangePreviewInput) => Promise<PlanChangePreview>;
  apply: (input: PlanChangeApplyInput) => Promise<CheckoutResult>;
  withdraw: (input: PlanChangeWithdrawInput) => Promise<unknown>;
  /** Merchant callbacks scoped to this selected subscription. */
  verifyCheckout?: (
    input: PlanChangeInput & {
      checkoutId: string;
      verification: RazorpayVerification;
    },
  ) => Promise<CheckoutStatus>;
  getCheckoutStatus?: (
    input: PlanChangeInput & { checkoutId: string },
  ) => Promise<CheckoutStatus>;
}
export interface PlanChangeControlProps {
  subscriptionId: string;
  /** Change when another control updates this subscription; in-flight request keys are preserved. */
  refreshKey?: string;
  actions: PlanChangeActions;
  onChanged?: () => void;
  onError?: (error: BillingPortalError) => void;
  returnUrl?: string;
  locale?: string;
  timezone?: string;
  nonce?: string;
}
type Attempt = {
  key: string;
  operation: PlanChangeOperation | "withdraw";
  target?: string;
  pendingId?: string;
  fromPlan?: string;
  quote?: PlanChangePreview;
  accepted: boolean;
  attempted: boolean;
};
const styles = `
.nozle-plan-change{font:inherit;color:var(--nozle-portal-text,#202922);margin-top:12px}
.nozle-plan-change button{font:inherit;padding:9px 14px;border:1px solid var(--nozle-portal-border,#dce2d9);border-radius:7px;background:var(--nozle-portal-background,#fff);color:inherit;cursor:pointer}
.nozle-plan-change button:disabled{opacity:.55;cursor:wait}
.nozle-plan-change :focus-visible{outline:2px solid var(--nozle-portal-accent,#526949);outline-offset:3px}
.nozle-plan-change [role=alert]{color:#922e25}
.nozle-plan-change .nzpc-actions{display:flex;gap:10px;flex-wrap:wrap}
.nozle-upgrade-modal select{box-sizing:border-box;width:100%;font:inherit;color:inherit;padding:10px;margin:8px 0;border:1px solid #dce2d9;border-radius:7px;background:var(--nozle-portal-background,#fff)}
.nozle-upgrade-modal dl{display:block;margin:16px 0;padding:0}
.nozle-upgrade-modal dl div{display:flex;justify-content:space-between;gap:16px;margin:12px 0}
.nozle-upgrade-modal dd{margin:0;text-align:right}
`;
const paymentPending = (state: PlanChangeState) =>
  ["awaiting_payment", "processing", "needs_review"].includes(
    state.checkoutStatus,
  );
function paymentMessage(state: PlanChangeState) {
  if (state.checkoutStatus === "needs_review")
    return "Payment needs review. Contact support before trying another payment.";
  return state.checkoutStatus === "awaiting_payment"
    ? "Complete payment to change your plan."
    : "Your change is processing. Your current plan remains active until confirmation.";
}
function done(attempt: Attempt, state: PlanChangeState) {
  if (attempt.operation === "withdraw")
    return (
      !state.pendingChange &&
      state.status === "active" &&
      state.currentPlan.code === attempt.fromPlan
    );
  return (
    (state.currentPlan.code === attempt.target && state.status === "active") ||
    state.pendingChange?.plan.code === attempt.target
  );
}

/** Payment-backed upgrades and scheduled downgrades for one external subscription. */
export function PlanChangeControl(props: PlanChangeControlProps) {
  return <PlanChangeFlow key={props.subscriptionId} {...props} />;
}
function PlanChangeFlow({
  subscriptionId,
  refreshKey,
  actions,
  onChanged,
  onError,
  returnUrl,
  locale = "en-US",
  timezone = "UTC",
  nonce,
}: PlanChangeControlProps) {
  const owner = useMemo(
    () => ({ controller: new AbortController() }),
    [subscriptionId, actions],
  );
  const latest = useRef(owner);
  latest.current = owner;
  const [loaded, setLoaded] = useState<{
    owner: object;
    value: PlanChangeState;
  }>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState<"choose" | "confirm" | "withdraw" | null>(
    null,
  );
  const [target, setTarget] = useState("");
  const [quote, setQuote] = useState<PlanChangePreview>();
  const [checkout, setCheckout] = useState<CheckoutResult | null>(null);
  const [withdrawTarget, setWithdrawTarget] = useState<{
    id: string;
    name: string;
    fromPlan: string;
    currentName: string;
  }>();
  const pending = useRef<Attempt | undefined>(undefined);
  const previousRefresh = useRef(refreshKey);
  const inFlight = useRef<AbortController | null>(null);
  const state = loaded?.owner === owner ? loaded.value : undefined;
  const errorCallback = useRef(onError),
    changedCallback = useRef(onChanged);
  errorCallback.current = onError;
  changedCallback.current = onChanged;

  async function run(task: (signal: AbortSignal) => Promise<void>) {
    if (latest.current !== owner || inFlight.current) return;
    const controller = new AbortController();
    inFlight.current = controller;
    setBusy(true);
    setFailure(undefined);
    let timedOut = false;
    let rejectAbort: () => void = () => {};
    const aborted = new Promise<never>((_, reject) => {
      rejectAbort = () => reject(new Error("aborted"));
      controller.signal.addEventListener("abort", rejectAbort, { once: true });
    });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 30000);
    try {
      await Promise.race([task(controller.signal), aborted]);
    } catch (error) {
      if (latest.current !== owner || (controller.signal.aborted && !timedOut))
        return;
      const safe =
        error instanceof BillingPortalError
          ? error
          : new BillingPortalError("request");
      if (safe.code === "changed") {
        pending.current = undefined;
        setQuote(undefined);
        setTarget("");
        setMode("choose");
        setFailure(
          "Your subscription or price changed. Check the latest details and confirm again.",
        );
      } else
        setFailure(
          timedOut
            ? "This request timed out. Check subscription status before retrying."
            : safe.code === "unauthorized"
              ? "Your session expired. Reconnect to manage your subscription."
              : "We could not confirm this change. Check subscription status before retrying.",
        );
      errorCallback.current?.(safe);
    } finally {
      clearTimeout(timer);
      controller.signal.removeEventListener("abort", rejectAbort);
      if (inFlight.current === controller) inFlight.current = null;
      if (latest.current === owner) setBusy(false);
    }
  }
  async function read(signal: AbortSignal, initial = false) {
    const value = await (initial ? actions.load : actions.status)({
      subscriptionId,
      signal,
    });
    if (signal.aborted || latest.current !== owner) return null;
    if (value.subscriptionId !== subscriptionId)
      throw new BillingPortalError("request");
    setLoaded({ owner, value });
    setCheckout(paymentPending(value) ? value.checkout : null);
    return value;
  }
  function finish(attempt: Attempt, value: PlanChangeState) {
    pending.current = undefined;
    setMode(null);
    setQuote(undefined);
    setCheckout(null);
    setNotice(
      attempt.operation === "withdraw"
        ? "Scheduled change removed. Your current plan will continue to renew."
        : value.pendingChange
          ? `Plan change scheduled for ${formatBillingDate(value.pendingChange.effectiveAt, locale, timezone)}.`
          : `Your ${value.currentPlan.name} plan is active.`,
    );
    changedCallback.current?.();
  }
  async function reconcile(signal: AbortSignal) {
    const value = await read(signal);
    if (!value) return null;
    const attempt = pending.current;
    if (attempt && done(attempt, value)) finish(attempt, value);
    else if (
      !attempt &&
      state &&
      (value.currentPlan.code !== state.currentPlan.code ||
        value.pendingChange?.id !== state.pendingChange?.id)
    ) {
      setNotice(
        value.pendingChange
          ? `Plan change scheduled for ${formatBillingDate(value.pendingChange.effectiveAt, locale, timezone)}.`
          : `Your ${value.currentPlan.name} plan is active.`,
      );
      changedCallback.current?.();
    } else if (["failed", "expired"].includes(value.checkoutStatus)) {
      pending.current = undefined;
      setCheckout(null);
      setMode(null);
      setNotice(
        "Payment did not complete. Your current plan is unchanged. You can choose a plan again.",
      );
    } else if (paymentPending(value) || attempt?.accepted) {
      setNotice(paymentMessage(value));
    }
    return value;
  }
  useEffect(() => {
    inFlight.current?.abort();
    inFlight.current = null;
    if (owner.controller.signal.aborted)
      owner.controller = new AbortController();
    pending.current = undefined;
    setMode(null);
    setQuote(undefined);
    setCheckout(null);
    setNotice("");
    void run(async (signal) => {
      await read(signal, true);
    });
    return () => {
      inFlight.current?.abort();
      owner.controller.abort();
    };
  }, [owner]);
  useEffect(() => {
    if (previousRefresh.current === refreshKey) return;
    previousRefresh.current = refreshKey;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      if (stopped) return;
      if (inFlight.current) {
        timer = setTimeout(refresh, 100);
        return;
      }
      void run(async (signal) => {
        await reconcile(signal);
      });
    };
    refresh();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [refreshKey, owner]);
  // Recover delayed confirmations without keeping a dialog or a browser-only payment record alive.
  useEffect(() => {
    if (
      !state ||
      state.checkoutStatus === "needs_review" ||
      (!paymentPending(state) && !pending.current?.accepted)
    )
      return;
    const timer = setInterval(() => {
      if (!document.hidden)
        void run(async (signal) => {
          await reconcile(signal);
        });
    }, 5000);
    return () => clearInterval(timer);
  }, [state, owner]);

  function openChange() {
    if (pending.current) {
      setMode(
        pending.current.operation === "withdraw" ? "withdraw" : "confirm",
      );
      return;
    }
    setTarget("");
    setQuote(undefined);
    setMode("choose");
    setFailure(undefined);
    void run(async (signal) => {
      await read(signal);
    });
  }
  async function prepare() {
    await run(async (signal) => {
      const value = await read(signal);
      if (!value) return;
      if (
        value.endingAt ||
        value.pendingChange ||
        paymentPending(value) ||
        !value.eligiblePlans.some((plan) => plan.code === target)
      )
        throw new BillingPortalError("changed");
      const result = await actions.preview({
        subscriptionId,
        targetPlanCode: target,
        signal,
      });
      if (signal.aborted) return;
      const plan = value.eligiblePlans.find((plan) => plan.code === target)!;
      if (
        result.operation !== plan.operation ||
        !result.quoteToken ||
        !Number.isFinite(Date.parse(result.effectiveAt)) ||
        (result.operation === "downgrade" && result.timing !== "end_of_period")
      )
        throw new BillingPortalError("request");
      const amounts = [
        result.creditAmountCents,
        result.debitAmountCents,
        result.netAmountCents,
        result.amountDueNowCents,
        result.amountDueAtEffectiveCents,
      ];
      if (
        !/^[A-Z]{3}$/.test(result.currency) ||
        amounts.some(
          (amount) =>
            formatMinorAmount(amount, result.currency, locale) ===
            "Amount unavailable",
        ) ||
        !["immediate", "end_of_period"].includes(result.timing) ||
        (result.renewalAt !== null &&
          !Number.isFinite(Date.parse(result.renewalAt)))
      )
        throw new BillingPortalError("request");
      setQuote(result);
      setMode("confirm");
    });
  }
  async function confirm() {
    if (mode === "choose") return prepare();
    await run(async (signal) => {
      let attempt = pending.current;
      if (!attempt) {
        if (mode === "withdraw") {
          if (!withdrawTarget) throw new BillingPortalError("changed");
          attempt = {
            key: crypto.randomUUID(),
            operation: "withdraw",
            pendingId: withdrawTarget.id,
            fromPlan: withdrawTarget.fromPlan,
            accepted: false,
            attempted: false,
          };
        } else {
          if (!quote) throw new BillingPortalError("changed");
          attempt = {
            key: crypto.randomUUID(),
            operation: quote.operation,
            target,
            quote,
            accepted: false,
            attempted: false,
          };
        }
        pending.current = attempt;
      }
      if (attempt.attempted) {
        await reconcile(signal);
        if (signal.aborted || pending.current !== attempt || attempt.accepted)
          return;
      }
      attempt.attempted = true;
      let result: CheckoutResult | undefined;
      try {
        if (attempt.operation === "withdraw")
          await actions.withdraw({
            subscriptionId,
            pendingChangeId: attempt.pendingId!,
            idempotencyKey: attempt.key,
            signal,
          });
        else
          result = await actions.apply({
            subscriptionId,
            targetPlanCode: attempt.target!,
            quoteToken: attempt.quote!.quoteToken,
            idempotencyKey: attempt.key,
            returnUrl:
              returnUrl ?? window.location.origin + window.location.pathname,
            signal,
          });
        if (signal.aborted) return;
        attempt.accepted = true;
        setMode(null);
      } catch (error) {
        if (!signal.aborted) {
          // A lost response may already have changed the subscription. Never blindly resubmit it.
          await reconcile(signal).catch(() => null);
          if (
            pending.current !== attempt &&
            !(error instanceof BillingPortalError && error.code === "changed")
          )
            return;
        }
        throw error;
      }
      const value = await reconcile(signal);
      if (!value || signal.aborted || pending.current !== attempt) return;
      if (
        result &&
        !["completed", "scheduled"].includes(
          "type" in result ? result.type : "",
        )
      )
        setCheckout(result);
    });
  }
  const check = () =>
    void run(async (signal) => {
      await reconcile(signal);
    });
  const selected = state?.eligiblePlans.find((plan) => plan.code === target);
  const money = (amount: string | number) =>
    formatMinorAmount(
      amount,
      quote?.currency ?? state?.currentPlan.currency ?? "USD",
      locale,
    );
  const blocked = Boolean(
    state?.endingAt ||
      state?.pendingChange ||
      (state && paymentPending(state)) ||
      state?.blockedReason ||
      pending.current?.accepted,
  );
  return (
    <div className="nozle-plan-change">
      <style nonce={nonce}>{styles}</style>
      {!state ? (
        <>
          <p role="status">Loading plan changes…</p>
          {failure && <p role="alert">{failure}</p>}
          <button type="button" onClick={check} disabled={busy}>
            Check subscription status
          </button>
        </>
      ) : (
        <>
          {state.pendingChange && (
            <p>
              Current plan until{" "}
              {formatBillingDate(
                state.pendingChange.effectiveAt,
                locale,
                timezone,
              )}
              , then {state.pendingChange.plan.name} at{" "}
              {formatMinorAmount(
                state.pendingChange.plan.amountCents,
                state.pendingChange.plan.currency,
                locale,
              )}{" "}
              / {state.pendingChange.plan.interval}.
            </p>
          )}
          {state.endingAt && (
            <p>Keep your subscription before choosing another plan.</p>
          )}
          {state.blockedReason &&
            !state.endingAt &&
            !state.pendingChange &&
            !paymentPending(state) && (
              <p>
                Plan changes are currently unavailable. Contact support for your
                options.
              </p>
            )}
          {!state.blockedReason &&
            !state.endingAt &&
            !state.pendingChange &&
            !paymentPending(state) &&
            state.eligiblePlans.length === 0 && (
              <p>No other plans are available for this subscription.</p>
            )}
          {["failed", "expired"].includes(state.checkoutStatus) && !notice && (
            <p>Payment did not complete. Your current plan is unchanged.</p>
          )}
          {paymentPending(state) && !notice && (
            <p role="status">{paymentMessage(state)}</p>
          )}
          <div className="nzpc-actions">
            {!blocked &&
              state.status === "active" &&
              state.eligiblePlans.length > 0 && (
                <button type="button" disabled={busy} onClick={openChange}>
                  Change plan
                </button>
              )}
            {state.pendingChange &&
              state.status === "active" &&
              !paymentPending(state) && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setWithdrawTarget({
                      id: state.pendingChange!.id,
                      name: state.pendingChange!.plan.name,
                      fromPlan: state.currentPlan.code,
                      currentName: state.currentPlan.name,
                    });
                    setMode("withdraw");
                    setFailure(undefined);
                  }}
                >
                  Keep current plan
                </button>
              )}
            {(paymentPending(state) || pending.current || failure) && (
              <button type="button" disabled={busy} onClick={check}>
                Check subscription status
              </button>
            )}
            {pending.current?.attempted && !pending.current.accepted && (
              <button type="button" disabled={busy} onClick={openChange}>
                Review and retry change
              </button>
            )}
          </div>
          {failure && !mode && <p role="alert">{failure}</p>}
          {notice && <p role="status">{notice}</p>}
          {checkout && (
            <Checkout
              key={"checkout_id" in checkout ? checkout.checkout_id : "payment"}
              checkout={checkout}
              returnUrl={returnUrl}
              verifyCheckout={
                actions.verifyCheckout
                  ? (checkoutId, verification) =>
                      actions.verifyCheckout!({
                        subscriptionId,
                        checkoutId,
                        verification,
                        signal: owner.controller.signal,
                      })
                  : undefined
              }
              getCheckoutStatus={
                actions.getCheckoutStatus
                  ? (checkoutId) =>
                      actions.getCheckoutStatus!({
                        subscriptionId,
                        checkoutId,
                        signal: owner.controller.signal,
                      })
                  : undefined
              }
              onSuccess={check}
              onComplete={check}
              onProcessing={check}
              onDismiss={() => {
                if (owner.controller.signal.aborted) return;
                setNotice(
                  "Payment was closed. Your plan changes only after payment is confirmed.",
                );
                check();
              }}
              onError={() => {
                if (owner.controller.signal.aborted) return;
                setFailure(
                  "Payment could not be completed. Check subscription status to continue.",
                );
                check();
              }}
            />
          )}
          <UpgradeModal
            isOpen={mode !== null}
            planCode={target}
            title={
              mode === "withdraw"
                ? "Keep your current plan?"
                : mode === "choose"
                  ? "Change plan"
                  : `Confirm ${quote?.operation ?? "plan change"}`
            }
            nonce={nonce}
            busy={busy}
            confirmDisabled={
              (mode === "choose" && (!target || blocked)) ||
              (mode === "confirm" && !quote)
            }
            confirmLabel={
              pending.current?.attempted
                ? "Check status / retry"
                : mode === "choose"
                  ? "Review change"
                  : mode === "withdraw"
                    ? "Confirm keep current plan"
                    : quote?.operation === "downgrade"
                      ? "Confirm downgrade"
                      : "Confirm upgrade"
            }
            onCancel={() => setMode(null)}
            onSubmit={confirm}
          >
            {failure && <p role="alert">{failure}</p>}
            {mode === "choose" && (
              <label>
                Choose a plan
                <select
                  value={target}
                  onChange={(event) => {
                    setTarget(event.target.value);
                    setQuote(undefined);
                  }}
                  disabled={busy}
                >
                  <option value="">Select a plan</option>
                  {state.eligiblePlans.map((plan) => (
                    <option key={plan.code} value={plan.code}>
                      {plan.name} —{" "}
                      {formatMinorAmount(
                        plan.amountCents,
                        plan.currency,
                        locale,
                      )}{" "}
                      / {plan.interval} ({plan.operation})
                    </option>
                  ))}
                </select>
              </label>
            )}
            {mode === "withdraw" && (
              <p>
                Remove the scheduled change to {withdrawTarget?.name}. Your{" "}
                {withdrawTarget?.currentName} plan will continue to renew.
              </p>
            )}
            {mode === "confirm" && quote && (
              <>
                <p>
                  {state.currentPlan.name} → {selected?.name ?? target}
                </p>
                {selected && (
                  <p>
                    {formatMinorAmount(
                      selected.amountCents,
                      selected.currency,
                      locale,
                    )}{" "}
                    / {selected.interval}. Base price, excluding tax and usage.
                  </p>
                )}
                <dl>
                  <div>
                    <dt>New plan charge</dt>
                    <dd>{money(quote.debitAmountCents)}</dd>
                  </div>
                  <div>
                    <dt>Credits applied</dt>
                    <dd>{money(quote.creditAmountCents)}</dd>
                  </div>
                  <div>
                    <dt>Due now</dt>
                    <dd>{money(quote.amountDueNowCents)}</dd>
                  </div>
                  <div>
                    <dt>Due at effective date</dt>
                    <dd>{money(quote.amountDueAtEffectiveCents)}</dd>
                  </div>
                </dl>
                <p>
                  Effective{" "}
                  {formatBillingDate(quote.effectiveAt, locale, timezone)}.{" "}
                  {quote.renewalAt &&
                    `Next renewal ${formatBillingDate(quote.renewalAt, locale, timezone)}.`}
                </p>
                {quote.timing === "end_of_period" ? (
                  <p>
                    Your current plan and access continue until the effective
                    date.
                  </p>
                ) : BigInt(quote.amountDueNowCents) === 0n ? (
                  <p>No payment is due now for this change.</p>
                ) : (
                  <p>
                    Your plan changes after the required payment is confirmed.
                  </p>
                )}
              </>
            )}
          </UpgradeModal>
        </>
      )}
    </div>
  );
}
