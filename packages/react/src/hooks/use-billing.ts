import { useInfiniteQuery, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useCallback } from "react";
import { useBillingContext, type BillingFetch } from "../provider.js";
import type { CreditBalanceData } from "../components/credits/CreditBalance.js";
import type { CreditOperationData } from "../components/credits/CreditHistory.js";
import type { CustomerUsageData } from "../components/usage/usage-data.js";

/** The customer's subscription with its plan and any scheduled change, or nulls without one. */
export interface BillingSubscription {
  subscription: {
    external_id: string;
    plan_code: string;
    status: string;
    ending_at: string | null;
    plan: { code: string; name: string; amount_cents: number | string; currency: string; interval: string };
    /** The version of the plan code the subscription is billed on (plan versioning). */
    plan_version?: number | null;
    /** That version's entitlements, from the billing handler: the limits the customer actually has. */
    entitlements?: { feature_type: string; code: string; name: string; usage_limit?: number | null }[] | null;
  } | null;
  pending_change: {
    plan_code: string;
    name: string;
    effective_at: string;
  } | null;
  /** The customer has an unpaid invoice past its due date. */
  past_due?: boolean;
}

/** An entitlement decision for one feature (`can()` on your backend). */
export interface EntitlementResult {
  allowed: boolean;
  used?: number;
  limit: number | null;
  remaining: number | null;
  reason?: string;
}

/** The price of changing to another plan, before the customer confirms. */
export interface UpgradePreview {
  quote_id: string;
  currency: string;
  net_amount_cents: number | string;
  amount_due_now_cents: number | string;
  amount_due_at_effective_cents: number | string;
  transition_direction: "upgrade" | "downgrade";
  timing: "immediate" | "end_of_period";
  effective_at: string;
  renewal_at: string | null;
}

interface CreditBalancesResponse {
  balances: Array<CreditBalanceData & { credit_system: string }>;
}

interface CreditHistoryPage {
  operations: CreditOperationData[];
  next_cursor: string | null;
}

function useBilling(): { fetchRoute: BillingFetch; queryClient: ReturnType<typeof useBillingContext>["queryClient"]; endpoint: string } {
  const { billingFetch, billingEndpoint, queryClient } = useBillingContext();
  if (!billingFetch || !billingEndpoint) {
    throw new Error("Billing hooks need BillingProvider billingEndpoint, a backend route served by createBillingHandler");
  }
  return { fetchRoute: billingFetch, queryClient, endpoint: billingEndpoint };
}

/** The signed-in customer's subscription, plan and scheduled change. */
export function useSubscription() {
  const { fetchRoute, queryClient, endpoint } = useBilling();
  return useQuery(
    { queryKey: ["nozle", endpoint, "subscription"], queryFn: () => fetchRoute<BillingSubscription>("subscription") },
    queryClient,
  );
}

/**
 * Whether the customer may use a feature now, with used, limit and remaining. A customer with several
 * subscriptions needs `subscriptionId` (external id) or `entityId`; without one the result is
 * `allowed: false, reason: "subscription_required"`.
 */
export function useEntitlement(
  featureCode: string,
  options: { enabled?: boolean; subscriptionId?: string; entityId?: string } = {},
) {
  const { fetchRoute, queryClient, endpoint } = useBilling();
  return useQuery(
    {
      queryKey: ["nozle", endpoint, "entitlement", featureCode, options.subscriptionId, options.entityId],
      queryFn: () =>
        fetchRoute<EntitlementResult>("entitlement", {
          feature: featureCode,
          subscription_id: options.subscriptionId,
          entity_id: options.entityId,
        }),
      enabled: Boolean(featureCode) && options.enabled !== false,
      staleTime: 10_000,
    },
    queryClient,
  );
}

/**
 * One credit balance, ready for `<CreditBalance balance={data} />`: the given credit system,
 * or the first one with credits, or the first one.
 */
export function useCreditBalance(creditSystemCode?: string) {
  const { fetchRoute, queryClient, endpoint } = useBilling();
  return useQuery(
    {
      queryKey: ["nozle", endpoint, "credits"],
      queryFn: () => fetchRoute<CreditBalancesResponse>("credits"),
      select: (data): CreditBalanceData | null => {
        const balances = data.balances ?? [];
        if (creditSystemCode) return balances.find((b) => b.credit_system === creditSystemCode) ?? null;
        return balances.find((b) => Number(b.available) > 0) ?? balances[0] ?? null;
      },
    },
    queryClient,
  );
}

/**
 * Credit operations, newest first, a page at a time. `operations` flattens the loaded pages for
 * `<CreditHistory operations={operations} hasMore={hasNextPage} onLoadMore={fetchNextPage} />`.
 */
export function useCreditHistory(options: { creditSystemCode?: string; limit?: number } = {}) {
  const { fetchRoute, queryClient, endpoint } = useBilling();
  const query = useInfiniteQuery(
    {
      queryKey: ["nozle", endpoint, "credit-history", options.creditSystemCode, options.limit],
      queryFn: ({ pageParam }) =>
        fetchRoute<CreditHistoryPage>("credit-history", {
          credit_system: options.creditSystemCode,
          limit: options.limit,
          cursor: pageParam,
        }),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (page) => page.next_cursor ?? undefined,
    },
    queryClient,
  );
  return { ...query, operations: query.data?.pages.flatMap((page) => page.operations) ?? [] };
}

/**
 * The current billing period's usage (`period: "current"`, the default) for `<UsageBreakdown>`,
 * or past periods (`period: "past"`) for `<UsageTrend>`.
 */
export function useUsage(options?: { period?: "current" }): UseQueryResult<CustomerUsageData | null>;
export function useUsage(options: { period: "past"; periods?: number }): UseQueryResult<CustomerUsageData[]>;
export function useUsage(
  options: { period?: "current" | "past"; periods?: number } = {},
): UseQueryResult<CustomerUsageData | CustomerUsageData[] | null> {
  const { fetchRoute, queryClient, endpoint } = useBilling();
  const period = options.period ?? "current";
  return useQuery(
    {
      queryKey: ["nozle", endpoint, "usage", period, options.periods],
      queryFn: () =>
        fetchRoute<{ usage?: CustomerUsageData | null; periods?: CustomerUsageData[] }>("usage", {
          period,
          periods: options.periods,
        }),
      select: (data) => (period === "past" ? (data.periods ?? []) : (data.usage ?? null)),
    },
    queryClient,
  );
}

/** One of the customer's finalized invoices. */
export interface InvoiceData {
  nozle_id: string;
  number: string;
  issuing_date: string;
  payment_due_date?: string | null;
  payment_status: string;
  payment_overdue?: boolean;
  currency: string;
  total_amount_cents: number;
  file_url?: string | null;
}

export interface InvoicePageData {
  invoices: InvoiceData[];
  meta: { current_page: number; next_page: number | null; prev_page: number | null; total_pages: number; total_count: number };
}

/** The customer's finalized invoices, newest first, 20 per page. */
export function useInvoices(options: { page?: number } = {}) {
  const { fetchRoute, queryClient, endpoint } = useBilling();
  const page = options.page ?? 1;
  return useQuery(
    {
      queryKey: ["nozle", endpoint, "invoices", page],
      queryFn: () => fetchRoute<InvoicePageData>("invoices", { page }),
    },
    queryClient,
  );
}

/**
 * Returns a function that resolves an invoice's PDF URL, or `null` while Nozle is still generating
 * the PDF (ask again in a few seconds). Your backend only answers for the customer's own invoices.
 */
export function useInvoiceDownload(): (invoiceId: string) => Promise<string | null> {
  const { fetchRoute } = useBilling();
  return useCallback(
    async (invoiceId: string) => (await fetchRoute<{ url: string | null }>("invoice-download", { id: invoiceId })).url,
    [fetchRoute],
  );
}

/** What changing to `planCode` would cost now and later. Does nothing until a plan is given. */
export function useUpgradePreview(planCode: string | undefined) {
  const { fetchRoute, queryClient, endpoint } = useBilling();
  return useQuery(
    {
      queryKey: ["nozle", endpoint, "preview", planCode],
      queryFn: () => fetchRoute<UpgradePreview>("preview", { plan: planCode }),
      enabled: Boolean(planCode),
      staleTime: 0,
    },
    queryClient,
  );
}

/** Returns a function that reloads every billing hook, for example after checkout or a plan change. */
export function useBillingRefresh(): () => Promise<void> {
  const { queryClient } = useBillingContext();
  return useCallback(() => queryClient.invalidateQueries({ queryKey: ["nozle"] }), [queryClient]);
}
