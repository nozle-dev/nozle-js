"use client";

/**
 * CurrentPlan — shows the customer's current subscription plan.
 * Fetches from GET /api/v1/subscriptions/current.
 * Includes plan name, interval, next billing date, status.
 */

import { useState, useEffect } from "react";
import { useBillingContext } from "../../provider.js";
import { PlanBadge } from "./PlanBadge.js";

export interface CurrentPlanData {
  id: string;
  planName: string;
  interval: string;
  status: string;
  nextBillingDate?: string;
  tier?: "free" | "starter" | "pro" | "enterprise";
}

export interface CurrentPlanProps {
  customerId: string;
  onChangePlan?: () => void;
  changePlanHref?: string;
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export function CurrentPlan({
  customerId,
  onChangePlan,
  changePlanHref = "/plans",
}: CurrentPlanProps) {
  const { client } = useBillingContext();
  const [plan, setPlan] = useState<CurrentPlanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!client) {
      setError("No client in context");
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchPlan(): Promise<void> {
      try {
        const clientInternal = client as unknown as {
          apiKey?: string;
          baseUrl?: string;
          timeout?: number;
        };
        const apiKey = clientInternal.apiKey ?? "";
        const baseUrl = clientInternal.baseUrl ?? "https://api.nozle.io";
        const timeout = clientInternal.timeout ?? 5000;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(
          `${baseUrl}/api/v1/subscriptions/current?customer_id=${customerId}`,
          {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: controller.signal,
          },
        );
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = (await response.json()) as CurrentPlanData;
        if (!cancelled) {
          setPlan(data);
          setLoading(false);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
          setLoading(false);
        }
      }
    }

    void fetchPlan();
    return () => {
      cancelled = true;
    };
  }, [client, customerId]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-2">
        <div
          className="h-6 w-32 rounded"
          style={{ background: "var(--nozle-border, var(--border))" }}
        />
        <div
          className="h-4 w-48 rounded"
          style={{ background: "var(--nozle-border, var(--border))" }}
        />
      </div>
    );
  }

  if (error || !plan) {
    return (
      <span
        style={{ color: "var(--nozle-destructive, var(--destructive))" }}
        className="text-sm"
      >
        Failed to load current plan
      </span>
    );
  }

  const handleChangePlan = () => {
    if (onChangePlan) {
      onChangePlan();
    } else {
      window.location.href = changePlanHref;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <PlanBadge plan={plan.planName} tier={plan.tier} />
        <span
          style={{
            color: "var(--nozle-muted-foreground, var(--muted-foreground))",
            fontSize: "0.875rem",
          }}
        >
          {plan.interval}
        </span>
        <span
          style={{
            color:
              plan.status === "active"
                ? "var(--nozle-success, #16a34a)"
                : "var(--nozle-warning, var(--warning))",
            fontSize: "0.875rem",
            fontWeight: 500,
          }}
        >
          {plan.status}
        </span>
      </div>
      {plan.nextBillingDate && (
        <p
          style={{
            color: "var(--nozle-muted-foreground, var(--muted-foreground))",
            fontSize: "0.875rem",
          }}
        >
          Next billing: {formatDate(plan.nextBillingDate)}
        </p>
      )}
      <button
        onClick={handleChangePlan}
        style={{
          background: "transparent",
          border: "1px solid var(--nozle-primary, var(--primary))",
          color: "var(--nozle-primary, var(--primary))",
          padding: "0.375rem 0.875rem",
          borderRadius: "0.375rem",
          fontSize: "0.875rem",
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        Change Plan
      </button>
    </div>
  );
}
