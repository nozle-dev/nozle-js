import { useQuery } from "@tanstack/react-query";
import { useBillingContext } from "../provider.js";
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

/** The public plan catalog, read with the publishable key and cached by TanStack Query. */
export function usePlans() {
  const { client, queryClient } = useBillingContext();
  const query = useQuery(
    {
      queryKey: ["nozle", "plans", client.baseUrl, client.publishableKey],
      queryFn: async ({ signal }) => {
        const response = await client.catalogFetch("/api/v1/plans", { signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as { plans?: Plan[] };
        return data.plans ?? [];
      },
      staleTime: 5 * 60_000,
      // The pricing page shows a load error at once; the app can call refetch().
      retry: false,
    },
    queryClient,
  );
  return {
    plans: query.data ?? [],
    isLoading: query.isPending,
    error: (query.error as Error | null) ?? null,
    refetch: query.refetch,
  };
}
