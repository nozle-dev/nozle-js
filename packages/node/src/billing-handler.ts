import type { Nozle } from "./client";
import { NozleApiError } from "./errors";

export interface BillingHandlerOptions {
  /**
   * The signed-in customer's Nozle external id, read from your own session or auth. Never take
   * it from the request query or body. Return null or undefined when no one is signed in; the
   * handler then answers 401.
   */
  getCustomerId(request: Request): string | null | undefined | Promise<string | null | undefined>;
}

type Route = (nozle: Nozle, customerId: string, query: URLSearchParams) => Promise<unknown>;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

class RouteError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

function required(query: URLSearchParams, name: string): string {
  const value = query.get(name)?.trim();
  if (!value) throw new RouteError(400, "invalid_request", `${name} is required`);
  return value;
}

async function activeSubscription(nozle: Nozle, customerId: string) {
  const subscriptions = await nozle.getSubscriptions(customerId);
  if (subscriptions.length > 1) {
    throw new RouteError(409, "active_subscription_ambiguous", "customer has more than one active subscription");
  }
  return subscriptions[0];
}

// Each route reads only the signed-in customer's own data; query parameters choose what, never whose.
const routes: Record<string, Route> = {
  async subscription(nozle, customerId) {
    // Past due: the customer has an unpaid invoice past its due date.
    const [subscription, overdue] = await Promise.all([
      activeSubscription(nozle, customerId),
      nozle.invoices.list(customerId, { paymentOverdue: true, perPage: 1 }),
    ]);
    const past_due = (overdue.meta?.total_count ?? overdue.invoices.length) > 0;
    if (!subscription) return { subscription: null, pending_change: null, past_due };
    const options = await nozle.subscriptionOptions(customerId, subscription.external_id);
    // The version the customer is billed on, and that version's entitlements: the public catalog lists the
    // current version only, so a customer on an older version would otherwise see another version's limits.
    const plan_version = subscription.plan_version ?? null;
    const plan = plan_version === null ? null : await nozle.planVersions.get<{ entitlements?: unknown[] }>(subscription.plan_code, plan_version).catch(() => null);
    const entitlements = plan?.entitlements ?? null;
    return { ...options, subscription: options.subscription && { ...options.subscription, plan_version, entitlements }, past_due };
  },
  entitlement: (nozle, customerId, query) => nozle.can(customerId, required(query, "feature")),
  credits: (nozle, customerId) => nozle.credits.listBalances(customerId),
  "credit-history": (nozle, customerId, query) => {
    const limit = query.get("limit");
    return nozle.credits.listOperations(customerId, {
      creditSystemCode: query.get("credit_system") ?? undefined,
      cursor: query.get("cursor") ?? undefined,
      limit: limit ? Number(limit) : undefined,
    });
  },
  async usage(nozle, customerId, query) {
    const subscription = await activeSubscription(nozle, customerId);
    if (!subscription) return { usage: null, periods: [] };
    const subscriptionId = subscription.external_id;
    if (query.get("period") === "past") {
      const periods = query.get("periods");
      return { periods: await nozle.pastUsage(customerId, { subscriptionId, periods: periods ? Number(periods) : undefined }) };
    }
    return { usage: await nozle.currentUsage(customerId, { subscriptionId }) };
  },
  async preview(nozle, customerId, query) {
    const subscription = await activeSubscription(nozle, customerId);
    if (!subscription) throw new RouteError(404, "subscription_not_found", "customer has no active subscription");
    return nozle.previewSubscriptionChange(customerId, subscription.external_id, required(query, "plan"));
  },
  // Finalized invoices only: drafts can still change and are not the customer's to see.
  invoices(nozle, customerId, query) {
    const page = Number(query.get("page") ?? 1);
    return nozle.invoices.list(customerId, { status: "finalized", page: page > 0 ? page : 1, perPage: 20 });
  },
  async "invoice-download"(nozle, customerId, query) {
    const invoice = await nozle.invoices.get(required(query, "id"));
    // Another customer's invoice answers exactly like a missing one.
    if (invoice.customer?.external_id !== customerId) {
      throw new RouteError(404, "invoice_not_found", "invoice not found");
    }
    return { url: await nozle.invoices.downloadUrl(invoice.nozle_id) };
  },
};

/** The route names a billing handler serves, as the last segment of the request path. */
export const BILLING_ROUTES = Object.keys(routes);

/**
 * A web-standard request handler that serves the `@nozle-js/react` billing hooks from your
 * backend with your secret key. Mount it under one path, for example `/api/nozle/[route]` in a
 * Next.js App Router route (`export const GET = handler`), Hono, Remix, Bun or Deno; the last
 * path segment picks the route. The customer always comes from `getCustomerId`, so a browser can
 * only read the signed-in customer's own billing data.
 */
export function createBillingHandler(nozle: Nozle, options: BillingHandlerOptions): (request: Request) => Promise<Response> {
  return async function billingHandler(request: Request): Promise<Response> {
    if (request.method !== "GET") return json(405, { code: "method_not_allowed" });
    const url = new URL(request.url);
    const name = url.pathname.split("/").filter(Boolean).pop() ?? "";
    const route = Object.prototype.hasOwnProperty.call(routes, name) ? routes[name] : undefined;
    if (!route) return json(404, { code: "not_found" });

    let customerId: string | null | undefined;
    try {
      customerId = await options.getCustomerId(request);
    } catch {
      customerId = undefined;
    }
    if (!customerId) return json(401, { code: "unauthorized" });

    try {
      return json(200, await route(nozle, customerId, url.searchParams));
    } catch (error) {
      if (error instanceof RouteError) return json(error.status, { code: error.code, message: error.message });
      if (error instanceof NozleApiError && error.status >= 400 && error.status < 500) {
        return json(error.status, { code: error.code ?? "request_failed", request_id: error.requestId });
      }
      // Upstream and unknown failures stay generic so no internal detail reaches the browser.
      const requestId = error instanceof NozleApiError ? error.requestId : undefined;
      return json(502, { code: "billing_unavailable", request_id: requestId });
    }
  };
}
