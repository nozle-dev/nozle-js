import { useSyncExternalStore } from "react";
import { useBillingContext } from "../provider";
import type { UsePlanResult } from "../types";

export function usePlan(): UsePlanResult {
  const { store } = useBillingContext();
  const state = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot
  );

  if (state.error) {
    return { data: null, isLoading: false, error: state.error };
  }
  if (state.entitlements === null) {
    return { data: null, isLoading: true, error: null };
  }

  return {
    data: {
      plan_slug: state.entitlements.plan_slug,
      subscription_status: state.entitlements.subscription_status,
    },
    isLoading: false,
    error: null,
  };
}
