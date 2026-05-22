import { useSyncExternalStore } from "react";
import { useBillingContext } from "../provider";
import type { UseCreditsResult } from "../types";

export function useCredits(): UseCreditsResult {
  const { store } = useBillingContext();
  const state = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot
  );

  if (state.error) {
    return { data: null, isLoading: false, error: state.error };
  }
  if (state.credits === null) {
    return { data: null, isLoading: true, error: null };
  }

  return { data: state.credits, isLoading: false, error: null };
}
