import { useSyncExternalStore } from "react";
import { useBillingContext } from "../provider";
import type { UseUsageResult } from "../types";

export function useUsage(metric: string): UseUsageResult {
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

  const usage = state.usage[metric] ?? null;
  return { data: usage, isLoading: false, error: null };
}
