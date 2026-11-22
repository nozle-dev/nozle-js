import { BillingRequestError, type BillingFetch, type NozleClient } from "../provider.js";

/** What your backend returns from `nozle.customerTokens.create(customerId)` (`@nozle-js/node`). */
export interface CustomerToken {
  token: string;
  /** The customer's external id. */
  customer_id: string;
  /** ISO 8601. */
  expires_at: string;
}

/** Calls your authenticated backend, which mints a token for the signed-in customer with its secret key. */
export type GetCustomerToken = () => Promise<CustomerToken>;

export const CUSTOMER_TOKEN_HEADER = "X-Nozle-Customer-Token";
const REFRESH_MARGIN_MS = 60_000;
const TOKEN_REFUSALS = new Set(["customer_token_expired", "invalid_customer_token"]);

export interface CustomerTokenSource {
  token(): Promise<CustomerToken>;
  invalidate(): void;
}

/**
 * Caches the token and asks for a new one when less than a minute (or half its lifetime, for a short one) is left,
 * one request at a time.
 */
export function customerTokenSource(get: GetCustomerToken, now: () => number = Date.now): CustomerTokenSource {
  let current: { token: CustomerToken; refreshAt: number } | undefined;
  let pending: Promise<CustomerToken> | undefined;
  return {
    token() {
      if (current && now() < current.refreshAt) return Promise.resolve(current.token);
      pending ??= get()
        .then((token) => {
          const obtained = now();
          const expires = Date.parse(token.expires_at);
          current = { token, refreshAt: expires - Math.min(REFRESH_MARGIN_MS, (expires - obtained) / 2) };
          return token;
        })
        .finally(() => {
          pending = undefined;
        });
      return pending;
    },
    invalidate() {
      current = undefined;
    },
  };
}

type Params = Record<string, string | number | undefined>;

interface CoreSubscription {
  external_id: string;
  plan_code: string;
  status: string;
  ending_at: string | null;
  plan_version?: number | null;
  next_plan_code?: string | null;
  downgrade_plan_date?: string | null;
}

interface EnginePlanStatus {
  plan_name?: string;
  interval?: string;
  amount_cents?: number;
  currency?: string;
}

function url(base: string, path: string, params: Params = {}): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  const search = query.toString();
  return `${base}${path}${search ? `?${search}` : ""}`;
}

/**
 * The billing hooks' routes read straight from Nozle with the publishable key and the customer's token, shaped like
 * `createBillingHandler`'s answers. Routes a token cannot read (previews, invoices) need `billingEndpoint`.
 */
export function createCustomerTokenFetch(client: NozleClient, coreUrl: string | undefined, source: CustomerTokenSource): BillingFetch {
  const read = async <T,>(target: string, retried = false): Promise<T> => {
    const { token } = await source.token();
    const response = await fetch(target, {
      headers: { Accept: "application/json", Authorization: `Bearer ${client.publishableKey}`, [CUSTOMER_TOKEN_HEADER]: token },
    });
    if (response.ok) return (await response.json()) as T;
    const body = (await response.json().catch(() => ({}))) as { code?: string; request_id?: string };
    if (response.status === 401 && body.code && TOKEN_REFUSALS.has(body.code) && !retried) {
      source.invalidate();
      return read<T>(target, true);
    }
    throw new BillingRequestError(response.status, body.code, body.request_id);
  };
  const core = (): string => {
    if (!coreUrl) throw new Error("BillingProvider needs coreUrl to read usage and subscriptions with a customer token");
    return coreUrl;
  };
  const customer = async () => encodeURIComponent((await source.token()).customer_id);
  const subscriptions = async (): Promise<CoreSubscription[]> => {
    const { customer_id } = await source.token();
    const list = await read<{ subscriptions?: CoreSubscription[] }>(
      url(core(), "/api/v1/subscriptions", { external_customer_id: customer_id, "status[]": "active" }),
    );
    return list.subscriptions ?? [];
  };
  const activeSubscription = async (): Promise<CoreSubscription | undefined> => {
    const list = await subscriptions();
    if (list.length > 1) throw new BillingRequestError(409, "active_subscription_ambiguous");
    return list[0];
  };

  const routes: Record<string, (params: Params) => Promise<unknown>> = {
    async entitlement(params) {
      const { customer_id } = await source.token();
      try {
        return await read(url(client.baseUrl, "/api/v1/can", {
          customer_id, feature: params.feature, subscription_id: params.subscription_id, entity_id: params.entity_id,
        }));
      } catch (error) {
        // A blocked customer is a denial, as createBillingHandler answers it.
        if (error instanceof BillingRequestError && error.status === 402 && error.code === "customer_payment_overdue") {
          return { allowed: false, reason: "customer_payment_overdue", used: 0, limit: null, remaining: null };
        }
        throw error;
      }
    },
    credits: async () => read(url(client.baseUrl, `/api/v1/customers/${await customer()}/credit-systems`)),
    "credit-history": async (params) =>
      read(url(client.baseUrl, `/api/v1/customers/${await customer()}/credit-operations`, {
        credit_system_code: params.credit_system, limit: params.limit, cursor: params.cursor,
      })),
    async subscription() {
      const subscription = await activeSubscription();
      if (!subscription) return { subscription: null, pending_change: null };
      const status = await read<EnginePlanStatus>(
        url(client.baseUrl, "/api/v1/subscriptions/current", { customer_id: (await source.token()).customer_id }),
      );
      return {
        subscription: {
          external_id: subscription.external_id,
          plan_code: subscription.plan_code,
          status: subscription.status,
          ending_at: subscription.ending_at,
          plan_version: subscription.plan_version ?? null,
          plan: {
            code: subscription.plan_code,
            name: status.plan_name || subscription.plan_code,
            amount_cents: status.amount_cents ?? 0,
            currency: status.currency ?? "",
            interval: status.interval ?? "",
          },
        },
        pending_change: subscription.next_plan_code
          ? { plan_code: subscription.next_plan_code, name: subscription.next_plan_code, effective_at: subscription.downgrade_plan_date ?? "" }
          : null,
      };
    },
    async usage(params) {
      const subscription = await activeSubscription();
      if (!subscription) return { usage: null, periods: [] };
      const path = `/api/v1/customers/${await customer()}`;
      if (params.period === "past") {
        const past = await read<{ usage_periods?: unknown[] }>(url(core(), `${path}/past_usage`, {
          external_subscription_id: subscription.external_id, periods_count: params.periods,
        }));
        return { periods: past.usage_periods ?? [] };
      }
      const current = await read<{ customer_usage: unknown }>(url(core(), `${path}/current_usage`, {
        external_subscription_id: subscription.external_id,
      }));
      return { usage: current.customer_usage };
    },
  };

  return async <T,>(route: string, params: Params = {}): Promise<T> => {
    const handler = Object.prototype.hasOwnProperty.call(routes, route) ? routes[route] : undefined;
    if (!handler) {
      throw new Error(`The ${route} hook needs BillingProvider billingEndpoint: a customer token reads entitlements, usage, credits and the subscription only`);
    }
    return (await handler(params)) as T;
  };
}
