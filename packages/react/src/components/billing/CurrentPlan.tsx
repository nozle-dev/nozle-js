"use client";

/**
 * CurrentPlan — the customer's plan at a glance: name, status, price, a scheduled change, usage
 * against the plan's limits, and a notice when a limit is close.
 *
 * Inside a BillingProvider with `billingEndpoint` it reads everything itself (useSubscription,
 * usePlans for the limits, useUsage for this period). Pass `subscription` and `usage` to render it
 * from your own data instead.
 */
import React, { type ReactNode } from "react";
import { useAppearance } from "../../appearance/context.js";
import { T, border, surface, type Appearance } from "../../appearance/tokens.js";
import { useSubscription, useUsage, type BillingSubscription } from "../../hooks/use-billing.js";
import { usePlans } from "../../hooks/use-plans.js";
import { formatPlanPrice, intervalLabel } from "../pricing/plan-features.js";
import { UsageMeter } from "../usage/UsageMeter.js";
import type { UsageDashboardFeature } from "../usage/UsageDashboard.js";
import type { CustomerUsageData } from "../usage/usage-data.js";

export interface CurrentPlanDetail {
  label: string;
  value: ReactNode;
}

export interface CurrentPlanProps {
  /** The `useSubscription` result. Omit it to read it through `billingEndpoint`. */
  subscription?: BillingSubscription | null;
  /** Meters to show. Omit to build them from the plan's metered limits and this period's usage. */
  usage?: UsageDashboardFeature[];
  /** Extra label and value rows, for example included events or a renewal date. */
  details?: CurrentPlanDetail[];
  /** Buttons for the header, for example a link to your billing portal. */
  actions?: ReactNode;
  /** Text of the notice shown when the customer is past due. */
  pastDueMessage?: string;
  /** A meter at or above this percentage shows a notice. Default 80; `null` turns notices off. */
  warningPercent?: number | null;
  title?: string;
  isLoading?: boolean;
  error?: Error | string | null;
  emptyMessage?: string;
  locale?: string;
  appearance?: Appearance;
}

// Core subscription statuses, compared exactly.
const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  pending: "Pending",
  incomplete: "Awaiting payment",
  canceled: "Canceled",
  terminated: "Ended",
};

function statusColors(status: string, ending: boolean): React.CSSProperties {
  if (status === "active" && !ending) return { background: T.successSoft, color: T.success };
  if (status === "active" || status === "pending" || status === "incomplete") {
    return { background: T.warningSoft, color: T.warningText };
  }
  return { background: T.muted, color: T.mutedForeground };
}

function day(value: string, locale: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString(locale, { dateStyle: "medium" });
}

/** Meters from the plan's metered limits joined with this period's units, by feature code. */
export function currentPlanMeters(
  entitlements: { feature_type: string; code: string; name: string; usage_limit?: number | null }[] | undefined,
  usage: CustomerUsageData | null | undefined,
): UsageDashboardFeature[] {
  const units = new Map<string, number>();
  for (const charge of usage?.charges_usage ?? []) {
    units.set(charge.feature.code, (units.get(charge.feature.code) ?? 0) + (Number(charge.units) || 0));
  }
  return (entitlements ?? [])
    .filter((entitlement) => entitlement.feature_type === "metered")
    .map((entitlement) => ({
      key: entitlement.code,
      label: entitlement.name,
      used: units.get(entitlement.code) ?? 0,
      limit: entitlement.usage_limit ?? null,
    }));
}

export function CurrentPlan(props: CurrentPlanProps): React.ReactElement {
  return props.subscription === undefined ? <CurrentPlanFromBackend {...props} /> : <CurrentPlanView {...props} />;
}

function CurrentPlanFromBackend(props: CurrentPlanProps): React.ReactElement {
  const subscription = useSubscription();
  const plans = usePlans();
  const usage = useUsage();
  const planCode = subscription.data?.subscription?.plan_code;
  const meters =
    props.usage ??
    currentPlanMeters(plans.plans.find((plan) => plan.code === planCode)?.entitlements, usage.data as CustomerUsageData | null);
  return (
    <CurrentPlanView
      {...props}
      subscription={subscription.data ?? null}
      usage={meters}
      isLoading={props.isLoading || subscription.isPending}
      error={props.error ?? (subscription.error as Error | null)}
    />
  );
}

function CurrentPlanView({
  subscription,
  usage = [],
  details = [],
  actions,
  warningPercent = 80,
  title = "Current plan",
  isLoading = false,
  error = null,
  emptyMessage = "No active plan.",
  pastDueMessage = "A payment is overdue. Pay the open invoice to keep your plan active.",
  locale = "en-US",
  appearance,
}: CurrentPlanProps): React.ReactElement {
  const { root, el } = useAppearance(appearance);
  const frame = { ...surface, padding: 0, overflow: "hidden" } as const;
  const header = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "0.875rem 1.25rem",
        borderBottom: border(),
        fontWeight: 700,
      }}
    >
      <span>{title}</span>
      {actions}
    </div>
  );
  const body = (children: ReactNode) => <div style={{ padding: "1.25rem", display: "grid", gap: "1rem" }}>{children}</div>;

  if (isLoading) {
    return (
      <section {...root("currentPlan", frame)} aria-busy="true">
        {header}
        {body(<div style={{ height: 72, borderRadius: `calc(${T.radius} / 2)`, background: T.skeleton }} />)}
      </section>
    );
  }
  if (error) {
    return (
      <section {...root("currentPlan", frame)}>
        {header}
        {body(<p role="alert" style={{ margin: 0, color: T.danger }}>{typeof error === "string" ? error : error.message}</p>)}
      </section>
    );
  }
  const current = subscription?.subscription;
  if (!current) {
    return (
      <section {...root("currentPlan", frame)}>
        {header}
        {body(<p role="status" style={{ margin: 0, color: T.mutedForeground }}>{emptyMessage}</p>)}
      </section>
    );
  }

  const pending = subscription?.pending_change;
  const ending = Boolean(current.ending_at);
  const near = warningPercent === null ? [] : usage.filter((meter) => meter.limit != null && meter.limit > 0 && (meter.used / meter.limit) * 100 >= warningPercent);
  const statusLabel = ending && current.ending_at ? `Ends ${day(current.ending_at, locale)}` : STATUS_LABELS[current.status] ?? current.status;

  return (
    <section {...root("currentPlan", frame)} aria-label={title}>
      {header}
      {body(
        <>
          {subscription?.past_due && (
            <p
              role="alert"
              {...el("currentPlan__notice", {
                margin: 0,
                padding: "0.625rem 0.875rem",
                fontSize: "0.875rem",
                borderRadius: `calc(${T.radius} / 2)`,
                background: T.dangerSoft,
                color: T.danger,
                border: border(T.dangerBorder),
              })}
            >
              {pastDueMessage}
            </p>
          )}
          {near.map((meter) => (
            <p
              key={meter.key}
              role="status"
              {...el("currentPlan__notice", {
                margin: 0,
                padding: "0.625rem 0.875rem",
                fontSize: "0.875rem",
                borderRadius: `calc(${T.radius} / 2)`,
                background: T.warningSoft,
                color: T.warningText,
                border: border(T.warningBorder),
              })}
            >
              You have used {Math.round((meter.used / (meter.limit as number)) * 100)}% of the {meter.label} included in{" "}
              {current.plan.name}.
            </p>
          ))}

          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.625rem" }}>
            <span {...el("currentPlan__name", { fontSize: "1.25rem", fontWeight: 700 })}>{current.plan.name}</span>
            <span
              {...el("currentPlan__status", {
                ...statusColors(current.status, ending),
                fontSize: "0.75rem",
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                padding: "0.125rem 0.625rem",
                borderRadius: 9999,
              })}
            >
              {statusLabel}
            </span>
            {pending && (
              <span
                {...el("currentPlan__scheduled", {
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  padding: "0.125rem 0.625rem",
                  borderRadius: 9999,
                  border: border(),
                  color: T.mutedForeground,
                })}
              >
                Changes to {pending.name} on {day(pending.effective_at, locale)}
              </span>
            )}
            <span {...el("currentPlan__price", { marginLeft: "auto", color: T.mutedForeground, fontSize: "0.875rem" })}>
              {formatPlanPrice(Number(current.plan.amount_cents), current.plan.currency)} / {intervalLabel(current.plan.interval)}
            </span>
          </div>

          {usage.length > 0 && (
            <div {...el("currentPlan__usage", { display: "grid", gap: "0.875rem" })}>
              {usage.map((meter) => (
                <UsageMeter
                  key={meter.key}
                  label={`${meter.label} used this period`}
                  used={meter.used}
                  limit={meter.limit}
                  appearance={appearance}
                />
              ))}
            </div>
          )}

          {details.length > 0 && (
            <dl
              {...el("currentPlan__details", {
                margin: 0,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: "0.75rem",
              })}
            >
              {details.map((detail) => (
                <div key={detail.label}>
                  <dt style={{ fontSize: "0.75rem", color: T.mutedForeground }}>{detail.label}</dt>
                  <dd style={{ margin: "0.125rem 0 0", fontWeight: 600 }}>{detail.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </>,
      )}
    </section>
  );
}
