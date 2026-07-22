"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useBillingContext } from "../provider.js";
import type {
  CreditOperation,
  EntityCreditOperationsResponse,
} from "../types.js";

export interface UseEntityCreditOperationsOptions {
  customerId?: string;
  creditSystemCode?: string;
  pageSize?: number;
}

export interface EntityCreditOperationsState {
  operations: CreditOperation[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  error: Error | null;
  loadMore: () => Promise<void>;
  refetch: () => void;
}

export function useEntityCreditOperations(
  entityId: string,
  options: UseEntityCreditOperationsOptions = {},
): EntityCreditOperationsState {
  const { client, customerId: contextCustomerId } = useBillingContext();
  const customerId = options.customerId ?? contextCustomerId;
  const creditSystemCode = options.creditSystemCode?.trim() ?? "";
  const requestedPageSize = options.pageSize ?? 20;
  const pageSize = Number.isFinite(requestedPageSize)
    ? Math.max(1, Math.min(100, Math.trunc(requestedPageSize)))
    : 20;
  const [operations, setOperations] = useState<CreditOperation[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);
  const loadingMoreRef = useRef(false);
  const generationRef = useRef(0);
  const nextCursorRef = useRef<string | null>(null);

  const refetch = useCallback(
    () => setRequestVersion((version) => version + 1),
    [],
  );

  const requestPage = useCallback(
    async (
      cursor: string,
      signal?: AbortSignal,
    ): Promise<EntityCreditOperationsResponse> => {
      if (!client || !customerId.trim() || !entityId.trim()) {
        throw new Error("customerId and entityId are required");
      }
      const search = new URLSearchParams({ limit: String(pageSize) });
      if (creditSystemCode) search.set("credit_system_code", creditSystemCode);
      if (cursor) search.set("cursor", cursor);
      const response = await client.creditFetch(
        `/api/v1/customers/${encodeURIComponent(customerId)}/entities/${encodeURIComponent(entityId)}/credit-operations?${search.toString()}`,
        { signal },
      );
      if (!response.ok) {
        throw new Error(
          `Entity credit operations request failed with HTTP ${response.status}`,
        );
      }
      return response.json() as Promise<EntityCreditOperationsResponse>;
    },
    [client, creditSystemCode, customerId, entityId, pageSize],
  );

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    loadingMoreRef.current = false;
    nextCursorRef.current = null;
    setOperations([]);
    setNextCursor(null);
    setIsLoading(true);
    setIsLoadingMore(false);
    setError(null);
    const controller = new AbortController();

    void requestPage("", controller.signal)
      .then((page) => {
        if (generationRef.current !== generation || controller.signal.aborted)
          return;
        setOperations(page.operations);
        setNextCursor(page.next_cursor);
        nextCursorRef.current = page.next_cursor;
      })
      .catch((reason: unknown) => {
        if (
          generationRef.current === generation &&
          !controller.signal.aborted
        ) {
          setError(
            reason instanceof Error ? reason : new Error(String(reason)),
          );
        }
      })
      .finally(() => {
        if (generationRef.current === generation && !controller.signal.aborted)
          setIsLoading(false);
      });

    return () => {
      controller.abort();
      if (generationRef.current === generation) generationRef.current += 1;
    };
  }, [requestPage, requestVersion]);

  const loadMore = useCallback(async () => {
    const cursor = nextCursorRef.current;
    if (!cursor || loadingMoreRef.current || isLoading) return;
    loadingMoreRef.current = true;
    setIsLoadingMore(true);
    setError(null);
    const generation = generationRef.current;
    try {
      const page = await requestPage(cursor);
      if (generationRef.current !== generation) return;
      setOperations((current) => {
        const seen = new Set(current.map((operation) => operation.id));
        return [
          ...current,
          ...page.operations.filter((operation) => !seen.has(operation.id)),
        ];
      });
      setNextCursor(page.next_cursor);
      nextCursorRef.current = page.next_cursor;
    } catch (reason: unknown) {
      if (generationRef.current === generation) {
        setError(reason instanceof Error ? reason : new Error(String(reason)));
      }
    } finally {
      if (generationRef.current === generation) {
        loadingMoreRef.current = false;
        setIsLoadingMore(false);
      }
    }
  }, [isLoading, requestPage]);

  return {
    operations,
    isLoading,
    isLoadingMore,
    hasMore: nextCursor !== null,
    error,
    loadMore,
    refetch,
  };
}
