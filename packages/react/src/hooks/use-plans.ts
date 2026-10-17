import { QueryClient, useQuery } from "@tanstack/react-query";
import { useBillingContext, type NozleClient } from "../provider.js";
import type {
  CatalogCharge,
  CatalogCreditGrantRule,
  CatalogEntitlement,
} from "../components/pricing/plan-features.js";

export interface Plan {
  code: string;
  name: string;
  amount_cents: number;
  amount_currency: string;
  interval: string;
  description?: string | null;
  /** The public catalog also returns these. They are absent from an older or reduced response. */
  entitlements?: CatalogEntitlement[];
  credit_grant_rules?: CatalogCreditGrantRule[];
  charges?: CatalogCharge[];
}

/** Keeps a catalog query call unconditional when there is no BillingProvider; never fetches. */
export const idleQueryClient = new QueryClient();

/** One request for the catalog: the plans and whether the components show "Powered by Nozle". */
export function catalogQuery(client: NozleClient | undefined) {
  return {
    queryKey: ["nozle", "plans", client?.baseUrl, client?.publishableKey],
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const response = await client!.catalogFetch("/api/v1/plans", { signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as { plans?: Plan[]; meta?: { nozle_branding?: boolean } };
      return { plans: data.plans ?? [], nozleBranding: data.meta?.nozle_branding === true };
    },
    staleTime: 5 * 60_000,
    // The pricing page shows a load error at once; the app can call refetch().
    retry: false,
  };
}

/** The public plan catalog, read with the publishable key and cached by TanStack Query. */
export function usePlans() {
  const { client, queryClient } = useBillingContext();
  const query = useQuery(catalogQuery(client), queryClient);
  return {
    plans: query.data?.plans ?? [],
    isLoading: query.isPending,
    error: (query.error as Error | null) ?? null,
    refetch: query.refetch,
  };
}
