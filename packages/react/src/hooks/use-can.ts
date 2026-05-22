import { useSyncExternalStore } from "react";
import { useBillingContext } from "../provider";
import type { UseCanResult } from "../types";

export function useCan(feature: string): UseCanResult {
  const { store } = useBillingContext();
  const state = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot
  );

  if (state.error) {
    return { allowed: false, isLoading: false, error: state.error };
  }
  if (state.entitlements === null) {
    return { allowed: false, isLoading: true, error: null };
  }

  const featureState = state.entitlements.features[feature];
  return {
    allowed: featureState?.enabled ?? false,
    isLoading: false,
    error: null,
  };
}
