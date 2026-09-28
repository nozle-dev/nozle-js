"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import {
  BillingPortalError,
  invoiceDownloadUrl,
  portalClient,
  type CreateBillingPortalSession,
  type PortalClient,
} from "./client.js";
import {
  identityQuery,
  subscriptionsQuery,
  subscriptionQuery,
  usageQuery,
  invoicesQuery,
  walletsQuery,
  updateCustomerMutation,
  downloadInvoiceMutation,
  topUpMutation,
  type Cents,
  type Customer,
  type Identity,
  type Page,
  type Subscription,
  type Usage,
  type Invoice,
  type Wallet,
} from "./operations.js";
import { portalStyles } from "./styles.js";
import { portalTimezones } from "./timezones.js";
import { compareDecimalStrings } from "../../core/decimal.js";
import { walletAmountCents } from "./amounts.js";
import {
  CancellationControl,
  type CancellationActions,
  type CancellationSubscription,
} from "./CancellationControl.js";
import {
  PlanChangeControl,
  type PlanChangeActions,
} from "./PlanChangeControl.js";

export interface BillingPortalProps {
  /** Stable callback to an authenticated merchant endpoint. Never accept customer identity from browser input. */
  createSession: CreateBillingPortalSession;
  /** Optional authenticated merchant callbacks enabling cancel/keep controls. */
  cancellationActions?: CancellationActions;
  /** Optional authenticated merchant callbacks for upgrades and scheduled downgrades. */
  planChangeActions?: PlanChangeActions;
  /** Formats amounts and dates. Interface copy is currently English. */
  locale?: string;
  className?: string;
  style?: CSSProperties;
  /** CSP nonce for the component's scoped stylesheet. No Tailwind setup is required. */
  nonce?: string;
  onError?: (error: BillingPortalError) => void;
}

function asError(error: unknown) {
  return error instanceof BillingPortalError
    ? error
    : new BillingPortalError("request");
}

/** Native React customer portal. Uses customer-scoped GraphQL, with no iframe or global auth storage. */
export function BillingPortal({
  createSession,
  cancellationActions,
  planChangeActions,
  locale = "en-US",
  className = "",
  style,
  nonce,
  onError,
}: BillingPortalProps) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    source: CreateBillingPortalSession;
    attempt: number;
    client?: PortalClient;
    error?: BillingPortalError;
  }>();
  const errorCallback = useRef(onError);
  errorCallback.current = onError;
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(() => {
      active = false;
      controller.abort();
      const error = new BillingPortalError("session");
      setState({ source: createSession, attempt, error });
      errorCallback.current?.(error);
    }, 20000);
    Promise.resolve()
      .then(() => createSession({ signal: controller.signal }))
      .then((session) => {
        if (active)
          setState({
            source: createSession,
            attempt,
            client: portalClient(session),
          });
      })
      .catch(() => {
        if (active) {
          const error = new BillingPortalError("session");
          setState({ source: createSession, attempt, error });
          errorCallback.current?.(error);
        }
      })
      .finally(() => clearTimeout(timer));
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [createSession, attempt]);
  // Hide the previous customer's data during render, before effects run on identity changes.
  const current =
    state?.source === createSession && state.attempt === attempt
      ? state
      : undefined;
  const reconnect = () => setAttempt((value) => value + 1);
  return (
    <div
      className={`nozle-billing-portal ${className}`}
      style={style}
      aria-label="Nozle billing portal"
    >
      <style nonce={nonce}>{portalStyles}</style>
      {current?.client ? (
        <Portal
          key={attempt}
          client={current.client}
          locale={locale}
          reconnect={reconnect}
          onError={onError}
          cancellationActions={cancellationActions}
          planChangeActions={planChangeActions}
          nonce={nonce}
        />
      ) : current?.error ? (
        <Failure error={current.error} retry={reconnect} />
      ) : (
        <Loading label="Starting billing session…" />
      )}
    </div>
  );
}

function useQuery<T>(
  client: PortalClient,
  query: string,
  variables: Record<string, unknown>,
  onError?: BillingPortalProps["onError"],
  retainDuringRefresh = false,
) {
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify(variables);
  const [state, setState] = useState<{
    client: PortalClient;
    key: string;
    attempt: number;
    data?: T;
    error?: BillingPortalError;
  }>();
  const callback = useRef(onError);
  callback.current = onError;
  useEffect(() => {
    const controller = new AbortController();
    client
      .request<T>(query, JSON.parse(key), controller.signal)
      .then((data) => {
        if (!controller.signal.aborted)
          setState({ client, key, attempt, data });
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          const error = asError(cause);
          setState({ client, key, attempt, error });
          callback.current?.(error);
        }
      });
    return () => controller.abort();
  }, [client, query, key, attempt]);
  const current =
    state?.client === client && state.key === key && state.attempt === attempt
      ? state
      : undefined;
  return {
    data:
      current?.data ??
      (retainDuringRefresh &&
      !current &&
      state?.client === client &&
      state.key === key
        ? state.data
        : undefined),
    error: current?.error,
    retry: () => setAttempt((n) => n + 1),
  };
}

function useAction(onError?: BillingPortalProps["onError"]) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<BillingPortalError>();
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  return {
    pending,
    error,
    run: async (action: (signal: AbortSignal) => Promise<void>) => {
      if (controller.current) return;
      const next = new AbortController();
      controller.current = next;
      setPending(true);
      setError(undefined);
      try {
        await action(next.signal);
      } catch (cause) {
        if (!next.signal.aborted) {
          const failure = asError(cause);
          setError(failure);
          onError?.(failure);
        }
      } finally {
        if (!next.signal.aborted) setPending(false);
        if (controller.current === next) controller.current = null;
      }
    },
  };
}

function Loading({ label = "Loading billing data…" }: { label?: string }) {
  return (
    <p className="nzp-empty" role="status">
      {label}
    </p>
  );
}
function Failure({
  error,
  retry,
  reconnect,
}: {
  error: BillingPortalError;
  retry?: () => void;
  reconnect?: () => void;
}) {
  const action = error.code === "unauthorized" ? (reconnect ?? retry) : retry;
  return (
    <div role="alert" className="nzp-error">
      <span>{error.message}</span>
      {action && (
        <button type="button" onClick={action}>
          {error.code === "unauthorized" ? "Reconnect" : "Try again"}
        </button>
      )}
    </div>
  );
}
function money(cents: Cents, currency: string, locale: string) {
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  });
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return formatter.format(Number(cents) / 10 ** digits);
}
function date(value: string | null, locale: string, timeZone?: string) {
  if (!value) return "—";
  // An invoice date is a calendar date, not midnight in the viewer's timezone.
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const zone = timeZone?.startsWith("TZ_")
    ? (portalTimezones[timeZone] ?? "UTC")
    : (timeZone ?? "UTC");
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: dateOnly ? "UTC" : zone,
  }).format(new Date(value));
}
const planName = (subscription: Subscription) =>
  subscription.name ||
  subscription.plan.invoiceDisplayName ||
  subscription.plan.name;
const intervals: Record<string, string> = {
  weekly: "week",
  monthly: "month",
  quarterly: "quarter",
  semiannual: "six months",
  yearly: "year",
};

type View =
  | { kind: "overview" }
  | { kind: "usage"; subscription: Subscription }
  | { kind: "edit" }
  | { kind: "wallet"; wallet: Wallet };
type SectionProps = {
  client: PortalClient;
  locale: string;
  reconnect: () => void;
  onError?: BillingPortalProps["onError"];
  cancellationActions?: CancellationActions;
  planChangeActions?: PlanChangeActions;
  nonce?: string;
};
function Portal(props: SectionProps) {
  const { client, locale, reconnect, onError } = props;
  const { data, error, retry } = useQuery<Identity>(
    client,
    identityQuery,
    {},
    onError,
  );
  const [view, setView] = useState<View>({ kind: "overview" });
  const [notice, setNotice] = useState("");
  const back = () => setView({ kind: "overview" });
  if (error)
    return <Failure error={error} retry={retry} reconnect={reconnect} />;
  if (!data) return <Loading />;
  const customer = data.customerPortalUser;
  return (
    <>
      <header>
        <div className="nzp-row">
          <span className="nzp-muted">
            {data.customerPortalOrganization.name}
          </span>
          <button type="button" onClick={reconnect}>
            Refresh portal
          </button>
        </div>
        <h2>Billing portal</h2>
        <p className="nzp-muted">
          {customer.name ||
            [customer.firstname, customer.lastname].filter(Boolean).join(" ") ||
            customer.email ||
            "Your account"}
        </p>
      </header>
      {notice && <p role="status">{notice}</p>}
      {view.kind !== "overview" && (
        <button type="button" onClick={back}>
          ← Back to overview
        </button>
      )}
      {view.kind === "overview" && (
        <>
          <Subscriptions
            {...props}
            timezone={customer.applicableTimezone}
            onUsage={(subscription) => setView({ kind: "usage", subscription })}
          />
          <Wallets
            {...props}
            onWallet={(wallet) => setView({ kind: "wallet", wallet })}
          />
          <section aria-label="Billing information">
            <div className="nzp-row">
              <h3>Billing information</h3>
              <button type="button" onClick={() => setView({ kind: "edit" })}>
                Edit billing information
              </button>
            </div>
            <dl>
              <div>
                <dt>Account name</dt>
                <dd>{customer.name || "Not provided"}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{customer.email || "Not provided"}</dd>
              </div>
              <div>
                <dt>Legal name</dt>
                <dd>{customer.legalName || "Not provided"}</dd>
              </div>
              <div>
                <dt>Tax ID</dt>
                <dd>{customer.taxIdentificationNumber || "Not provided"}</dd>
              </div>
              <div>
                <dt>Billing address</dt>
                <dd>
                  {[
                    customer.addressLine1,
                    customer.addressLine2,
                    customer.city,
                    customer.state,
                    customer.zipcode,
                    customer.country,
                  ]
                    .filter(Boolean)
                    .join(", ") || "Not provided"}
                </dd>
              </div>
            </dl>
          </section>
          <Invoices {...props} />
        </>
      )}
      {view.kind === "usage" && (
        <UsageDetails
          {...props}
          subscription={view.subscription}
          timezone={customer.applicableTimezone}
        />
      )}
      {view.kind === "edit" && (
        <CustomerForm
          {...props}
          customer={customer}
          onSaved={() => {
            setNotice("Billing information saved.");
            back();
            retry();
          }}
          onCancel={back}
        />
      )}
      {view.kind === "wallet" && (
        <WalletTopUp
          {...props}
          wallet={view.wallet}
          onCreated={() => {
            setNotice(
              "Top-up requested. Your balance updates after payment is processed.",
            );
            back();
          }}
        />
      )}
      <footer>Powered by Nozle</footer>
    </>
  );
}

function Pager({
  page,
  total,
  setPage,
}: {
  page: number;
  total: number;
  setPage: (page: number) => void;
}) {
  if (total <= 1) return null;
  return (
    <div className="nzp-actions" aria-label="Pagination">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => setPage(page - 1)}
      >
        Previous
      </button>
      <span>
        Page {page} of {total}
      </span>
      <button
        type="button"
        disabled={page >= total}
        onClick={() => setPage(page + 1)}
      >
        Next
      </button>
    </div>
  );
}
function Subscriptions({
  client,
  locale,
  timezone,
  reconnect,
  onError,
  onUsage,
  cancellationActions,
  planChangeActions,
  nonce,
}: SectionProps & {
  timezone: string;
  onUsage: (subscription: Subscription) => void;
}) {
  const [page, setPage] = useState(1);
  const [updated, setUpdated] = useState<Record<string, Subscription>>({});
  const { data, error, retry } = useQuery<{
    customerPortalSubscriptions: Page<Subscription>;
  }>(client, subscriptionsQuery, { page }, onError, true);
  const result = data?.customerPortalSubscriptions;
  useEffect(() => setUpdated({}), [result]);
  return (
    <section aria-label="Subscriptions">
      <h3>Subscriptions</h3>
      {error ? (
        <Failure error={error} retry={retry} reconnect={reconnect} />
      ) : !result ? (
        <Loading />
      ) : (
        <>
          {result.collection.length === 0 ? (
            <p className="nzp-empty">No active subscriptions.</p>
          ) : (
            <div className="nzp-stack">
              {result.collection
                .map((item) => updated[item.id] ?? item)
                .map((subscription) => (
                  <article
                    className="nzp-card"
                    data-subscription-id={subscription.externalId}
                    key={subscription.externalId || subscription.id}
                  >
                    <div className="nzp-row">
                      <h3>{planName(subscription)}</h3>
                      <span className="nzp-badge">
                        {subscription.endingAt ? "Scheduled to end" : "Active"}
                      </span>
                    </div>
                    <div className="nzp-price">
                      {money(
                        subscription.plan.amountCents,
                        subscription.plan.amountCurrency,
                        locale,
                      )}{" "}
                      <span className="nzp-muted">
                        /{" "}
                        {intervals[subscription.plan.interval] ||
                          subscription.plan.interval}
                      </span>
                    </div>
                    <div className="nzp-row">
                      <p className="nzp-muted">
                        Base price, excluding tax and usage
                        <br />
                        Current period ends{" "}
                        {date(
                          subscription.currentBillingPeriodEndingAt,
                          locale,
                          timezone,
                        )}
                      </p>
                      <button
                        type="button"
                        onClick={() => onUsage(subscription)}
                      >
                        View usage
                      </button>
                    </div>
                    {subscription.endingAt && (
                      <p>
                        Cancels on{" "}
                        {date(subscription.endingAt, locale, timezone)}
                      </p>
                    )}
                    {subscription.nextSubscription?.status === "pending" && (
                      <p>
                        Scheduled plan:{" "}
                        {subscription.nextSubscription.plan.name}
                      </p>
                    )}
                    {cancellationActions && subscription.externalId && (
                      <CancellationControl
                        subscription={cancellationState(subscription)}
                        actions={cancellationActions}
                        locale={locale}
                        timezone={timezone}
                        nonce={nonce}
                        onError={onError}
                        onChanged={retry}
                        refresh={async (signal) => {
                          const result = await client.request<{
                            customerPortalSubscription: Subscription | null;
                          }>(
                            subscriptionQuery,
                            { id: subscription.id },
                            signal,
                          );
                          if (
                            !signal.aborted &&
                            result.customerPortalSubscription
                          ) {
                            const fresh = result.customerPortalSubscription;
                            setUpdated((previous) => ({
                              ...previous,
                              [fresh.id]: fresh,
                            }));
                          }
                          return result.customerPortalSubscription
                            ? cancellationState(
                                result.customerPortalSubscription,
                              )
                            : null;
                        }}
                      />
                    )}
                    {planChangeActions && subscription.externalId && (
                      <PlanChangeControl
                        subscriptionId={subscription.externalId}
                        refreshKey={`${subscription.id}:${subscription.endingAt ?? ""}:${subscription.nextSubscription?.id ?? ""}:${subscription.plan.code}`}
                        actions={planChangeActions}
                        locale={locale}
                        timezone={timezone}
                        nonce={nonce}
                        onError={onError}
                        onChanged={retry}
                      />
                    )}
                  </article>
                ))}
            </div>
          )}
          <Pager
            page={page}
            total={result.metadata.totalPages}
            setPage={setPage}
          />
        </>
      )}
    </section>
  );
}
function cancellationState(
  subscription: Subscription,
): CancellationSubscription {
  return {
    id: subscription.id,
    externalId: subscription.externalId,
    name: planName(subscription),
    status: subscription.status,
    endingAt: subscription.endingAt,
    pendingPlanName:
      subscription.nextSubscription?.status === "pending"
        ? subscription.nextSubscription.plan.name
        : null,
  };
}
function UsageDetails({
  client,
  locale,
  reconnect,
  onError,
  subscription,
  timezone,
}: SectionProps & { subscription: Subscription; timezone: string }) {
  const { data, error, retry } = useQuery<{
    customerPortalCustomerUsage: Usage;
  }>(client, usageQuery, { subscriptionId: subscription.id }, onError);
  const usage = data?.customerPortalCustomerUsage;
  return (
    <section aria-label="Subscription usage">
      <h3>{planName(subscription)} · Usage</h3>
      {error ? (
        <Failure error={error} retry={retry} reconnect={reconnect} />
      ) : !usage ? (
        <Loading />
      ) : (
        <>
          <p className="nzp-muted">
            {date(usage.fromDatetime, locale, timezone)} –{" "}
            {date(usage.toDatetime, locale, timezone)}
          </p>
          <p className="nzp-price">
            {money(usage.amountCents, usage.currency, locale)}
          </p>
          <p className="nzp-muted">Current usage, excluding tax</p>
          {usage.chargesUsage.length ? (
            <div className="nzp-table">
              <table>
                <thead>
                  <tr>
                    <th>Feature</th>
                    <th>Units</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.chargesUsage.map((charge, index) => (
                    <tr key={`${charge.id}-${index}`}>
                      <td>
                        {charge.charge?.invoiceDisplayName ||
                          charge.feature?.name ||
                          charge.feature?.code ||
                          "Usage"}
                      </td>
                      <td>{charge.units}</td>
                      <td>
                        {money(charge.amountCents, usage.currency, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="nzp-empty">
              No usage recorded for this billing period.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function Invoices(props: SectionProps) {
  const { client, locale, reconnect, onError } = props;
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState({ page: 1, searchTerm: "" });
  const { data, error, retry } = useQuery<{
    customerPortalInvoices: Page<Invoice>;
  }>(client, invoicesQuery, filter, onError);
  const result = data?.customerPortalInvoices;
  return (
    <section aria-label="Invoice history">
      <h3>Invoice history</h3>
      <form
        className="nzp-actions"
        onSubmit={(event) => {
          event.preventDefault();
          setFilter({ page: 1, searchTerm: search.trim() });
        }}
      >
        <label>
          Search invoices
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <button type="submit">Search</button>
      </form>
      {error ? (
        <Failure error={error} retry={retry} reconnect={reconnect} />
      ) : !result ? (
        <Loading />
      ) : (
        <>
          {!result.collection.length ? (
            <p className="nzp-empty">
              {filter.searchTerm
                ? "No invoices match your search."
                : "No invoices yet."}
            </p>
          ) : (
            <div className="nzp-table">
              <table>
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>PDF</th>
                  </tr>
                </thead>
                <tbody>
                  {result.collection.map((invoice) => (
                    <tr key={invoice.id}>
                      <td>{invoice.number}</td>
                      <td>{date(invoice.issuingDate, locale)}</td>
                      <td>
                        {money(
                          invoice.totalAmountCents,
                          invoice.currency,
                          locale,
                        )}
                      </td>
                      <td>
                        {invoice.paymentOverdue
                          ? "Overdue"
                          : invoice.paymentStatus === "succeeded"
                            ? "Paid"
                            : invoice.paymentDisputeLostAt
                              ? "Disputed"
                              : "To pay"}
                      </td>
                      <td>
                        <InvoiceDownload {...props} invoice={invoice} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pager
            page={filter.page}
            total={result.metadata.totalPages}
            setPage={(page) => setFilter({ ...filter, page })}
          />
        </>
      )}
    </section>
  );
}
function InvoiceDownload({
  client,
  invoice,
  onError,
  reconnect,
}: SectionProps & { invoice: Invoice }) {
  const [url, setUrl] = useState("");
  const [generating, setGenerating] = useState(false);
  const action = useAction(onError);
  const download = () =>
    action.run(async (signal) => {
      const data = await client.request<{
        downloadCustomerPortalInvoice: { fileUrl: string | null };
      }>(downloadInvoiceMutation, { input: { id: invoice.id } }, signal);
      if (signal.aborted) return;
      const file = data.downloadCustomerPortalInvoice.fileUrl;
      if (file) {
        setUrl(invoiceDownloadUrl(file));
        setGenerating(false);
      } else setGenerating(true);
    });
  return (
    <>
      {url ? (
        <a
          className="nzp-link"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          referrerPolicy="no-referrer"
        >
          Open PDF
        </a>
      ) : (
        <button
          type="button"
          disabled={action.pending}
          aria-label={`Download invoice ${invoice.number}`}
          onClick={download}
        >
          {action.pending
            ? "Preparing…"
            : generating
              ? "Check PDF"
              : "Download"}
        </button>
      )}
      {generating && (
        <p className="nzp-muted" role="status">
          PDF is being generated. Check again shortly.
        </p>
      )}
      {action.error && <Failure error={action.error} reconnect={reconnect} />}
    </>
  );
}

const customerFields = [
  ["name", "Account name"],
  ["firstname", "First name"],
  ["lastname", "Last name"],
  ["email", "Email"],
  ["legalName", "Legal name"],
  ["taxIdentificationNumber", "Tax ID"],
  ["addressLine1", "Address line 1"],
  ["addressLine2", "Address line 2"],
  ["city", "City"],
  ["state", "State / province"],
  ["zipcode", "Postal code"],
  ["country", "Country code"],
] as const;
function CustomerForm({
  client,
  customer,
  reconnect,
  onError,
  onSaved,
  onCancel,
}: SectionProps & {
  customer: Customer;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState(
    () =>
      Object.fromEntries(
        customerFields.map(([key]) => [key, customer[key] ?? ""]),
      ) as Record<(typeof customerFields)[number][0], string>,
  );
  const action = useAction(onError);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    // Send only edited, supported fields. No customer ID or unrelated shipping changes.
    const input = Object.fromEntries(
      customerFields
        .filter(([key]) => values[key] !== (customer[key] ?? ""))
        .map(([key]) => [
          key,
          key === "country" ? values[key].toUpperCase() || null : values[key],
        ]),
    );
    void action.run(async (signal) => {
      await client.request(updateCustomerMutation, { input }, signal);
      if (!signal.aborted) onSaved();
    });
  };
  return (
    <section aria-label="Edit billing information">
      <h3>Edit billing information</h3>
      <form onSubmit={submit}>
        <div className="nzp-fields">
          {customerFields.map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                type={key === "email" ? "email" : "text"}
                value={values[key]}
                disabled={action.pending}
                pattern={key === "country" ? "[A-Za-z]{2}" : undefined}
                maxLength={key === "country" ? 2 : 255}
                placeholder={key === "country" ? "US" : undefined}
                onChange={(event) =>
                  setValues({ ...values, [key]: event.target.value })
                }
              />
            </label>
          ))}
        </div>
        {action.error && <Failure error={action.error} reconnect={reconnect} />}
        <div className="nzp-actions">
          <button
            type="submit"
            className="nzp-primary"
            disabled={action.pending}
          >
            {action.pending ? "Saving…" : "Save billing information"}
          </button>
          <button type="button" disabled={action.pending} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}
function Wallets({
  client,
  locale,
  reconnect,
  onError,
  onWallet,
}: SectionProps & { onWallet: (wallet: Wallet) => void }) {
  const [page, setPage] = useState(1);
  const { data, error, retry } = useQuery<{
    customerPortalWallets: Page<Wallet>;
  }>(client, walletsQuery, { page }, onError);
  const result = data?.customerPortalWallets;
  if (result && !result.collection.length) return null;
  return (
    <section aria-label="Wallets">
      <h3>Wallets</h3>
      {error ? (
        <Failure error={error} retry={retry} reconnect={reconnect} />
      ) : !result ? (
        <Loading />
      ) : (
        <>
          <div className="nzp-stack">
            {result.collection.map((wallet) => (
              <article className="nzp-card" key={wallet.id}>
                <h3>{wallet.name || "Prepaid credits"}</h3>
                <div className="nzp-price">
                  {money(wallet.balanceCents, wallet.currency, locale)}
                </div>
                <div className="nzp-row">
                  <p className="nzp-muted">
                    {wallet.creditsBalance} credits available ·{" "}
                    {wallet.consumedCredits} consumed
                  </p>
                  <button type="button" onClick={() => onWallet(wallet)}>
                    Add credits
                  </button>
                </div>
              </article>
            ))}
          </div>
          <Pager
            page={page}
            total={result.metadata.totalPages}
            setPage={setPage}
          />
        </>
      )}
    </section>
  );
}
function WalletTopUp({
  client,
  locale,
  wallet,
  reconnect,
  onError,
  onCreated,
}: SectionProps & { wallet: Wallet; onCreated: () => void }) {
  const [credits, setCredits] = useState("");
  const action = useAction(onError);
  const digits =
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: wallet.currency,
    }).resolvedOptions().maximumFractionDigits ?? 2;
  const amountCents = walletAmountCents(credits, wallet.rateAmount, digits);
  const valid =
    amountCents !== null &&
    compareDecimalStrings(credits, "0") > 0 &&
    (wallet.paidTopUpMinAmountCents == null ||
      compareDecimalStrings(
        amountCents,
        String(wallet.paidTopUpMinAmountCents),
      ) >= 0) &&
    (wallet.paidTopUpMaxAmountCents == null ||
      compareDecimalStrings(
        amountCents,
        String(wallet.paidTopUpMaxAmountCents),
      ) <= 0);
  return (
    <section aria-label="Add credits">
      <h3>Add credits · {wallet.name || "Wallet"}</h3>
      <p className="nzp-muted">
        A paid top-up creates a billing transaction. Credits become available
        after payment is processed.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (valid)
            void action.run(async (signal) => {
              await client.request(
                topUpMutation,
                { input: { walletId: wallet.id, paidCredits: credits } },
                signal,
              );
              if (!signal.aborted) onCreated();
            });
        }}
      >
        <div className="nzp-fields">
          <label>
            Credits to add
            <input
              inputMode="decimal"
              maxLength={36}
              required
              value={credits}
              disabled={action.pending}
              onChange={(event) => setCredits(event.target.value)}
            />
          </label>
        </div>
        <p>
          {amountCents !== null
            ? money(amountCents, wallet.currency, locale)
            : "—"}{" "}
          excluding tax
        </p>
        {wallet.paidTopUpMinAmountCents != null && (
          <p className="nzp-muted">
            Minimum{" "}
            {money(wallet.paidTopUpMinAmountCents, wallet.currency, locale)}
          </p>
        )}
        {wallet.paidTopUpMaxAmountCents != null && (
          <p className="nzp-muted">
            Maximum{" "}
            {money(wallet.paidTopUpMaxAmountCents, wallet.currency, locale)}
          </p>
        )}
        {action.error && <Failure error={action.error} reconnect={reconnect} />}
        <div className="nzp-actions">
          <button
            type="submit"
            className="nzp-primary"
            disabled={!valid || action.pending}
          >
            {action.pending ? "Requesting…" : "Confirm paid top-up"}
          </button>
        </div>
      </form>
    </section>
  );
}
