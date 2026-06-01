"use client";

/**
 * CreditHistory — renders a list of credit transactions for a customer.
 * Shows type badge, amount, description, and date. Latest first.
 * Max 20 rows with "View all" link.
 */

import type React from "react";
import { useState, useEffect } from "react";
import { useBillingContext } from "../../provider.js";

export interface CreditTransaction {
  id: string;
  amount: number;
  type: string;
  description: string;
  createdAt: string;
}

export interface CreditHistoryProps {
  customerId: string;
  viewAllHref?: string;
}

type TxType = "grant" | "deduct" | "purchase" | "application";

const TYPE_BADGE_STYLES: Record<TxType, React.CSSProperties> = {
  grant: {
    background: "var(--nozle-success-bg, #dcfce7)",
    color: "var(--nozle-success, #16a34a)",
  },
  deduct: {
    background: "var(--nozle-destructive-bg, #fee2e2)",
    color: "var(--nozle-destructive, #dc2626)",
  },
  purchase: {
    background: "var(--nozle-info-bg, #dbeafe)",
    color: "var(--nozle-info, #2563eb)",
  },
  application: {
    background: "var(--nozle-muted, #f1f5f9)",
    color: "var(--nozle-muted-foreground, #64748b)",
  },
};

function getTypeBadgeStyle(type: string): React.CSSProperties {
  return TYPE_BADGE_STYLES[type as TxType] ?? TYPE_BADGE_STYLES.application;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export function CreditHistory({
  customerId,
  viewAllHref = "/billing/credits",
}: CreditHistoryProps) {
  const { client } = useBillingContext();
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!client) {
      setError("No client in context");
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchHistory(): Promise<void> {
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
          `${baseUrl}/api/v1/credits/${customerId}/transactions`,
          {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: controller.signal,
          },
        );
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = (await response.json()) as {
          transactions?: CreditTransaction[];
        };
        if (!cancelled) {
          setTransactions(
            (data.transactions ?? [])
              .slice()
              .sort(
                (a, b) =>
                  new Date(b.createdAt).getTime() -
                  new Date(a.createdAt).getTime(),
              ),
          );
          setLoading(false);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
          setLoading(false);
        }
      }
    }

    void fetchHistory();
    return () => {
      cancelled = true;
    };
  }, [client, customerId]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-6 rounded"
            style={{ background: "var(--nozle-border, var(--border))" }}
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <span
        style={{ color: "var(--nozle-destructive, var(--destructive))" }}
        className="text-sm"
      >
        Failed to load transactions
      </span>
    );
  }

  const displayed = transactions.slice(0, 20);

  return (
    <div className="space-y-2">
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr
            style={{
              borderBottom: "1px solid var(--nozle-border, var(--border))",
              fontSize: "0.75rem",
              color: "var(--nozle-muted-foreground, var(--muted-foreground))",
            }}
          >
            <th style={{ textAlign: "left", padding: "0.25rem 0.5rem" }}>
              Type
            </th>
            <th style={{ textAlign: "right", padding: "0.25rem 0.5rem" }}>
              Amount
            </th>
            <th style={{ textAlign: "left", padding: "0.25rem 0.5rem" }}>
              Description
            </th>
            <th style={{ textAlign: "right", padding: "0.25rem 0.5rem" }}>
              Date
            </th>
          </tr>
        </thead>
        <tbody>
          {displayed.map((tx) => (
            <tr
              key={tx.id}
              style={{
                borderBottom: "1px solid var(--nozle-border, var(--border))",
                fontSize: "0.875rem",
              }}
            >
              <td style={{ padding: "0.5rem" }}>
                <span
                  style={{
                    ...getTypeBadgeStyle(tx.type),
                    padding: "0.125rem 0.5rem",
                    borderRadius: "9999px",
                    fontSize: "0.75rem",
                    fontWeight: 500,
                  }}
                >
                  {tx.type}
                </span>
              </td>
              <td
                style={{
                  textAlign: "right",
                  padding: "0.5rem",
                  fontVariantNumeric: "tabular-nums",
                  color:
                    tx.type === "deduct"
                      ? "var(--nozle-destructive, var(--destructive))"
                      : "var(--nozle-success, #16a34a)",
                }}
              >
                {tx.type === "deduct" ? "-" : "+"}
                {Math.abs(tx.amount).toLocaleString()}
              </td>
              <td
                style={{
                  padding: "0.5rem",
                  color: "var(--nozle-foreground, var(--foreground))",
                }}
              >
                {tx.description}
              </td>
              <td
                style={{
                  textAlign: "right",
                  padding: "0.5rem",
                  color:
                    "var(--nozle-muted-foreground, var(--muted-foreground))",
                  fontSize: "0.75rem",
                }}
              >
                {formatDate(tx.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {transactions.length > 20 && (
        <div style={{ textAlign: "right" }}>
          <a
            href={viewAllHref}
            style={{
              color: "var(--nozle-primary, var(--primary))",
              fontSize: "0.875rem",
              textDecoration: "underline",
            }}
          >
            View all ({transactions.length})
          </a>
        </div>
      )}
      {displayed.length === 0 && (
        <p
          style={{
            color: "var(--nozle-muted-foreground, var(--muted-foreground))",
            fontSize: "0.875rem",
            textAlign: "center",
            padding: "1rem",
          }}
        >
          No credit transactions yet.
        </p>
      )}
    </div>
  );
}
