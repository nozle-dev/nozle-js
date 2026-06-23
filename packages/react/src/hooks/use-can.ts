/**
 * useCan hook — check whether a customer can use a feature.
 * SDK-03: Calls client.can() for initial state, then subscribes to Centrifugo
 * workspace:{id}:entitlements channel for live updates.
 *
 * CONTEXT.md hard requirement: NO setInterval polling — Centrifugo WebSocket only.
 */

import { useState, useEffect } from "react";
import { Centrifuge } from "centrifuge";
import { useBillingContext } from '../provider.js';

export interface CanState {
  allowed: boolean;
  remaining: number | null;
  limit: number | null;
  loading: boolean;
  error: string | null;
}

const initialState: CanState = {
  allowed: false,
  remaining: null,
  limit: null,
  loading: true,
  error: null,
};

interface EntitlementPublication {
  customerId?: string;
  customer_id?: string;
  featureKey?: string;
  feature_key?: string;
  allowed?: boolean;
  remaining?: number;
  limit?: number;
}

/**
 * Check whether a customer is entitled to a feature.
 * Subscribes to Centrifugo workspace:{workspaceId}:entitlements channel for live updates.
 * No polling — WebSocket only per CONTEXT.md locked decision.
 *
 * @param customerId - Customer ID to check entitlement for
 * @param featureKey - Feature key to check
 * @returns CanState with allowed, remaining, limit, loading, error
 */
export function useCan(customerId: string, featureKey: string, metadata?: Record<string, string>): CanState {
  const { client, workspaceId, centrifugoUrl, centrifugoToken } =
    useBillingContext();
  const [state, setState] = useState<CanState>(initialState);

  // Initial entitlement check via client.can()
  useEffect(() => {
    if (!client) {
      setState({
        ...initialState,
        loading: false,
        error: "No client in context",
      });
      return;
    }

    let cancelled = false;
    setState(initialState);

    async function checkEntitlement(): Promise<void> {
      try {
        const result = await client!.can(customerId, featureKey, metadata);
        if (!cancelled) {
          setState({
            allowed: result.allowed,
            remaining: result.remaining,
            limit: result.limit,
            loading: false,
            error: result.error ?? null,
          });
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Unknown error";
          setState({
            allowed: false,
            remaining: null,
            limit: null,
            loading: false,
            error: message,
          });
        }
      }
    }

    void checkEntitlement();

    return () => {
      cancelled = true;
    };
  }, [client, customerId, featureKey, metadata]);

  // Centrifugo subscription for live updates
  // CONTEXT.md hard requirement: Centrifugo WebSocket only, no setInterval
  useEffect(() => {
    if (!centrifugoToken || !centrifugoUrl || !workspaceId) {
      return;
    }

    const cf = new Centrifuge(centrifugoUrl, {
      token: centrifugoToken,
    });

    const channel = `workspace:${workspaceId}:entitlements`;
    const sub = cf.newSubscription(channel);

    sub.on("publication", (ctx: { data: EntitlementPublication }) => {
      const data = ctx.data;
      // Only update state if this publication is for the same customer+feature
      const pubCustomerId = data.customerId ?? data.customer_id;
      const pubFeatureKey = data.featureKey ?? data.feature_key;

      if (pubCustomerId === customerId && pubFeatureKey === featureKey) {
        setState((prev) => ({
          ...prev,
          allowed: data.allowed ?? prev.allowed,
          remaining:
            data.remaining !== undefined ? data.remaining : prev.remaining,
          limit: data.limit !== undefined ? data.limit : prev.limit,
        }));
      }
    });

    sub.subscribe();
    cf.connect();

    return () => {
      sub.unsubscribe();
      cf.disconnect();
    };
  }, [centrifugoToken, centrifugoUrl, workspaceId, customerId, featureKey]);

  return state;
}
