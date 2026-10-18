import { QueryClient, useQuery } from "@tanstack/react-query";
import { useBillingContext, type NozleClient } from "../provider.js";
import { sanitizeSavedAppearance } from "../appearance/saved.js";
import type {
  PricingFamily,
  PricingPlan,
} from "../components/pricing/catalog.js";

/**
 * A plan from the public catalog (`GET /api/v1/plans`). The catalog also returns entitlements, credit
 * grants and charges; they are absent from an older or reduced response.
 */
export type Plan = PricingPlan;

/** Keeps a catalog query call unconditional when there is no BillingProvider; never fetches. */
export const idleQueryClient = new QueryClient();

/**
 * One request for the catalog: the plans, the plan families (null when the API returns no `families`
 * key), whether the components show "Powered by Nozle" and the appearance saved in the dashboard.
 */
export function catalogQuery(client: NozleClient | undefined) {
  return {
    queryKey: ["nozle", "plans", client?.baseUrl, client?.publishableKey],
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const response = await client!.catalogFetch("/api/v1/plans", { signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as {
        plans?: Plan[];
        families?: PricingFamily[] | null;
        meta?: { nozle_branding?: boolean; sdk_appearance?: unknown };
      };
      return {
        plans: data.plans ?? [],
        families: Array.isArray(data.families) ? data.families : null,
        nozleBranding: data.meta?.nozle_branding === true,
        saved: sanitizeSavedAppearance(data.meta?.sdk_appearance),
      };
    },
    staleTime: 5 * 60_000,
    // The pricing page shows a load error at once; the app can call refetch().
    retry: false,
  };
}

/**
 * The public plan catalog, read with the publishable key and cached by TanStack Query. `families` is
 * null when the API returns no `families` key (older APIs); pass `{ plans, families }` to
 * `getPricingCards` either way.
 */
export function usePlans() {
  const { client, queryClient } = useBillingContext();
  const query = useQuery(catalogQuery(client), queryClient);
  return {
    plans: query.data?.plans ?? [],
    families: query.data?.families ?? null,
    isLoading: query.isPending,
    error: (query.error as Error | null) ?? null,
    refetch: query.refetch,
  };
}
