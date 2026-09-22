"use client";

import { useEffect, useId, useRef, useState } from "react";
import { BillingPortalError } from "./client.js";
import { portalTimezones } from "./timezones.js";

export type CancellationOperation = "cancel" | "uncancel";
export interface CancellationSubscription {
  /** Core UUID, distinct from the external subscription identifier. */
  id: string;
  externalId: string;
  name: string;
  status: string;
  endingAt: string | null;
  pendingPlanName?: string | null;
}
export interface CancellationPreview {
  operation: CancellationOperation;
  effectiveAt: string;
  renewalAt: string | null;
}
export interface CancellationInput {
  /** External subscription identifier. The merchant authenticates the customer separately. */
  subscriptionId: string;
  operation: CancellationOperation;
  signal: AbortSignal;
}
export interface CancellationApplyInput extends CancellationInput {
  idempotencyKey: string;
  /** Required for cancellation; the server must reject a changed access-end date. */
  expectedEffectiveAt?: string;
}
export interface CancellationActions {
  preview: (input: CancellationInput) => Promise<CancellationPreview>;
  apply: (input: CancellationApplyInput) => Promise<unknown>;
}
export interface CancellationControlProps {
  subscription: CancellationSubscription;
  actions: CancellationActions;
  /** Read persisted state after every attempt, including an ambiguous network failure. */
  refresh: (signal: AbortSignal) => Promise<CancellationSubscription | null>;
  onChanged?: () => void;
  onError?: (error: BillingPortalError) => void;
  locale?: string;
  timezone?: string;
  nonce?: string;
}

const styles = `
.nozle-cancellation{font:inherit;color:var(--nozle-portal-text,#202922)}
.nozle-cancellation button{font:inherit;padding:9px 14px;border:1px solid var(--nozle-portal-border,#dce2d9);border-radius:7px;background:var(--nozle-portal-background,#fff);color:inherit;cursor:pointer}
.nozle-cancellation button:disabled{opacity:.55;cursor:wait}
.nozle-cancellation :focus-visible{outline:2px solid var(--nozle-portal-accent,#526949);outline-offset:3px}
.nozle-cancellation .nzc-backdrop{position:fixed;inset:0;background:#0006;z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px}
.nozle-cancellation .nzc-dialog{box-sizing:border-box;background:var(--nozle-portal-background,#fff);border:1px solid var(--nozle-portal-border,#dce2d9);border-radius:12px;padding:24px;width:100%;max-width:440px;max-height:90dvh;overflow:auto;box-shadow:0 12px 48px #0003}
.nozle-cancellation .nzc-dialog h3{margin:0 0 16px;font-size:20px}
.nozle-cancellation .nzc-dialog p{margin:12px 0;line-height:1.55}
.nozle-cancellation .nzc-buttons{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:10px;margin-top:20px}
.nozle-cancellation [role=alert]{color:#922e25}
`;

function formatDate(value: string, locale: string, timezone: string) {
  const timeZone = timezone.startsWith("TZ_")
    ? (portalTimezones[timezone] ?? "UTC")
    : timezone;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone,
  }).format(new Date(value));
}
function completed(
  operation: CancellationOperation,
  state: CancellationSubscription | null,
) {
  if (!state) return false;
  return operation === "cancel"
    ? Boolean(state.endingAt) ||
        ["terminated", "canceled"].includes(state.status)
    : state.status === "active" && !state.endingAt;
}

/** Customer cancellation UI. All mutations go through the merchant's authenticated callbacks. */
export function CancellationControl(props: CancellationControlProps) {
  // A different subscription must never inherit a previous subscription's confirmation or request key.
  return (
    <CancellationFlow
      key={`${props.subscription.id}:${props.subscription.externalId}`}
      {...props}
    />
  );
}

function CancellationFlow({
  subscription,
  actions,
  refresh,
  onChanged,
  onError,
  locale = "en-US",
  timezone = "UTC",
  nonce,
}: CancellationControlProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<CancellationPreview>();
  const [failure, setFailure] = useState<string>();
  const [notice, setNotice] = useState("");
  const [observed, setObserved] = useState<CancellationSubscription | null>(
    subscription,
  );
  const request = useRef<
    | {
        operation: CancellationOperation;
        idempotencyKey: string;
        expectedEffectiveAt?: string;
        attempted: boolean;
        accepted: boolean;
      }
    | undefined
  >(undefined);
  const inFlight = useRef<AbortController | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const active = observed?.status === "active";
  const ending = observed?.endingAt;
  const expired = Boolean(ending && Date.parse(ending) <= Date.now());
  const operation: CancellationOperation = ending ? "uncancel" : "cancel";

  useEffect(
    () => setObserved(subscription),
    [
      subscription.id,
      subscription.externalId,
      subscription.status,
      subscription.endingAt,
      subscription.name,
      subscription.pendingPlanName,
    ],
  );
  useEffect(() => () => inFlight.current?.abort(), []);
  useEffect(() => {
    if (!open) return;
    dialog.current?.focus();
    return () => trigger.current?.focus();
  }, [open]);

  function report(cause: unknown, message: string) {
    const error =
      cause instanceof BillingPortalError
        ? cause
        : new BillingPortalError("request");
    setFailure(error.code === "unauthorized" ? error.message : message);
    onError?.(error);
  }
  async function run(task: (signal: AbortSignal) => Promise<void>) {
    if (inFlight.current) return;
    const controller = new AbortController();
    inFlight.current = controller;
    setBusy(true);
    let timedOut = false;
    let rejectAborted: () => void = () => {};
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectAborted = () => reject(new DOMException("Aborted", "AbortError"));
      controller.signal.addEventListener("abort", rejectAborted, {
        once: true,
      });
    });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 30_000);
    try {
      await Promise.race([task(controller.signal), aborted]);
    } catch (cause) {
      if (timedOut)
        report(
          cause,
          "This request timed out. Check its status before trying again.",
        );
    } finally {
      clearTimeout(timeout);
      controller.signal.removeEventListener("abort", rejectAborted);
      if (!controller.signal.aborted || timedOut) setBusy(false);
      if (inFlight.current === controller) inFlight.current = null;
    }
  }
  function finish(
    state: CancellationSubscription | null,
    op: CancellationOperation,
  ) {
    setObserved(state);
    request.current = undefined;
    setOpen(false);
    setPreview(undefined);
    setFailure(undefined);
    setNotice(
      op === "cancel"
        ? "Cancellation scheduled."
        : "Your subscription will continue to renew.",
    );
    onChanged?.();
  }
  async function loadPreview() {
    setOpen(true);
    setFailure(undefined);
    if (request.current) return; // Reopening an uncertain request must preserve its confirmation/key.
    setPreview(undefined);
    await run(async (signal) => {
      try {
        const state = await refresh(signal);
        if (signal.aborted) return;
        setObserved(state);
        if (
          !state ||
          state.status !== "active" ||
          Boolean(state.endingAt) !== Boolean(ending)
        ) {
          setFailure(
            "Your subscription changed. Close this dialog and refresh your billing details.",
          );
          return;
        }
        const result = await actions.preview({
          subscriptionId: subscription.externalId,
          operation,
          signal,
        });
        if (signal.aborted) return;
        if (
          result.operation !== operation ||
          !Number.isFinite(Date.parse(result.effectiveAt)) ||
          (result.renewalAt !== null &&
            !Number.isFinite(Date.parse(result.renewalAt)))
        )
          throw new Error();
        setPreview(result);
      } catch (cause) {
        if (!signal.aborted)
          report(cause, "Could not load this change. Please try again.");
      }
    });
  }
  async function confirm() {
    if (!preview || inFlight.current) return;
    if (!request.current) {
      request.current = {
        operation: preview.operation,
        idempotencyKey: crypto.randomUUID(),
        ...(preview.operation === "cancel"
          ? { expectedEffectiveAt: preview.effectiveAt }
          : {}),
        attempted: false,
        accepted: false,
      };
    }
    setFailure(undefined);
    await run(async (signal) => {
      const current = request.current!;
      let cause: unknown;
      try {
        // Check state before a retry. Reuse the same key if the first response was lost.
        if (current.attempted) {
          const state = await refresh(signal);
          if (signal.aborted) return;
          if (completed(current.operation, state)) {
            finish(state, current.operation);
            return;
          }
        }
        if (!current.accepted) {
          current.attempted = true;
          await actions.apply({
            subscriptionId: subscription.externalId,
            operation: current.operation,
            idempotencyKey: current.idempotencyKey,
            expectedEffectiveAt: current.expectedEffectiveAt,
            signal,
          });
          current.accepted = true;
        }
      } catch (error) {
        cause = error;
        if (
          !signal.aborted &&
          error instanceof BillingPortalError &&
          error.code === "changed"
        ) {
          request.current = undefined;
          setPreview(undefined);
          try {
            const state = await refresh(signal);
            if (signal.aborted) return;
            setObserved(state);
          } catch {
            if (signal.aborted) return;
          }
          setFailure(error.message);
          onError?.(error);
          return;
        }
      }
      if (signal.aborted) return;
      try {
        const state = await refresh(signal);
        if (signal.aborted) return;
        setObserved(state);
        if (completed(current.operation, state)) {
          finish(state, current.operation);
          return;
        }
      } catch (error) {
        cause ??= error;
      }
      if (!signal.aborted)
        report(
          cause,
          "We could not confirm this change. Check its status before trying again.",
        );
    });
  }

  return (
    <div className="nozle-cancellation">
      <style nonce={nonce}>{styles}</style>
      {notice && <p role="status">{notice}</p>}
      {active && !expired && (
        <button ref={trigger} type="button" onClick={() => void loadPreview()}>
          {ending ? "Keep my subscription" : "Cancel subscription"}
        </button>
      )}
      {open && (
        <div className="nzc-backdrop">
          <div
            className="nzc-dialog"
            ref={dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            tabIndex={-1}
            onKeyDown={(event) => {
              if (event.key === "Escape" && !busy) {
                event.preventDefault();
                setOpen(false);
              }
              if (event.key === "Tab") {
                const buttons = Array.from(
                  dialog.current?.querySelectorAll<HTMLButtonElement>(
                    "button:not(:disabled)",
                  ) ?? [],
                );
                const first = buttons[0],
                  last = buttons[buttons.length - 1];
                if (!first) {
                  event.preventDefault();
                  return;
                }
                if (
                  event.shiftKey &&
                  (document.activeElement === first ||
                    document.activeElement === dialog.current)
                ) {
                  event.preventDefault();
                  last.focus();
                } else if (
                  !event.shiftKey &&
                  (document.activeElement === last ||
                    document.activeElement === dialog.current)
                ) {
                  event.preventDefault();
                  first.focus();
                }
              }
            }}
          >
            <h3 id={titleId}>
              {(preview?.operation ?? operation) === "cancel"
                ? "Cancel subscription?"
                : "Keep your subscription?"}
            </h3>
            <p id={descriptionId}>{subscription.name}</p>
            {preview &&
              (preview.operation === "cancel" ? (
                <>
                  <p>
                    If you confirm, your subscription will end on{" "}
                    <strong>
                      {formatDate(preview.effectiveAt, locale, timezone)}
                    </strong>
                    .
                  </p>
                  <p>
                    You can keep your subscription before cancellation takes
                    effect. Outstanding invoices and usage charges still apply.
                  </p>
                  {observed?.pendingPlanName && (
                    <p>
                      Your scheduled change to {observed.pendingPlanName} will
                      be removed. Keeping your subscription later will not
                      restore that change.
                    </p>
                  )}
                </>
              ) : (
                <p>
                  Your current plan will continue to renew
                  {preview.renewalAt
                    ? ` on ${formatDate(preview.renewalAt, locale, timezone)}`
                    : ""}
                  .
                </p>
              ))}
            {busy && (
              <p role="status">
                {request.current
                  ? "Confirming subscription status…"
                  : "Loading subscription details…"}
              </p>
            )}
            {failure && <p role="alert">{failure}</p>}
            <div className="nzc-buttons">
              <button
                type="button"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Close
              </button>
              {!preview && failure && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void loadPreview()}
                >
                  Try again
                </button>
              )}
              {preview && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void confirm()}
                >
                  {request.current
                    ? "Check status / retry"
                    : preview.operation === "cancel"
                      ? "Confirm cancellation"
                      : "Confirm keep subscription"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
