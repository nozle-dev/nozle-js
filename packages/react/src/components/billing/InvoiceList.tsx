"use client";

/**
 * InvoiceList — renders customer invoices with status badge and download link.
 * Fetches from GET /api/v1/invoices?customer_id={customerId}.
 */

import type React from "react";
import { useState, useEffect } from "react";
import { useBillingContext } from "../../provider.js";

export interface Invoice {
  id: string;
  number: string;
  date: string;
  amount: number;
  currency: string;
  status: "draft" | "open" | "paid" | "void" | "uncollectible";
  pdf_url?: string;
}

export interface InvoiceListProps {
  customerId: string;
}

const STATUS_STYLES: Record<string, React.CSSProperties> = {
  paid: {
    background: "var(--nozle-success-bg, #dcfce7)",
    color: "var(--nozle-success, #16a34a)",
  },
  open: {
    background: "var(--nozle-info-bg, #dbeafe)",
    color: "var(--nozle-info, #2563eb)",
  },
  draft: {
    background: "var(--nozle-muted, #f1f5f9)",
    color: "var(--nozle-muted-foreground, #64748b)",
  },
  void: {
    background: "var(--nozle-muted, #f1f5f9)",
    color: "var(--nozle-muted-foreground, #64748b)",
  },
  uncollectible: {
    background: "var(--nozle-destructive-bg, #fee2e2)",
    color: "var(--nozle-destructive, #dc2626)",
  },
};

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

export function InvoiceList({ customerId }: InvoiceListProps) {
  const { client } = useBillingContext();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!client) {
      setError("No client in context");
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchInvoices(): Promise<void> {
      try {
        const clientInternal = client as unknown as {
          apiKey?: string;
          baseUrl?: string;
          timeout?: number;
        };
        const apiKey = clientInternal.apiKey ?? "";
        const baseUrl = clientInternal.baseUrl ?? "https://api.nozle.app";
        const timeout = clientInternal.timeout ?? 5000;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(
          `${baseUrl}/api/v1/invoices?customer_id=${customerId}`,
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
          invoices?: Invoice[];
          data?: Invoice[];
        };
        if (!cancelled) {
          setInvoices(data.invoices ?? data.data ?? []);
          setLoading(false);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
          setLoading(false);
        }
      }
    }

    void fetchInvoices();
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
            className="h-8 rounded"
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
        Failed to load invoices
      </span>
    );
  }

  if (invoices.length === 0) {
    return (
      <p
        style={{
          color: "var(--nozle-muted-foreground, var(--muted-foreground))",
          fontSize: "0.875rem",
          textAlign: "center",
          padding: "1.5rem",
        }}
      >
        No invoices yet.
      </p>
    );
  }

  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr
          style={{
            borderBottom: "1px solid var(--nozle-border, var(--border))",
            fontSize: "0.75rem",
            color: "var(--nozle-muted-foreground, var(--muted-foreground))",
          }}
        >
          <th style={{ textAlign: "left", padding: "0.5rem" }}>#</th>
          <th style={{ textAlign: "left", padding: "0.5rem" }}>Date</th>
          <th style={{ textAlign: "right", padding: "0.5rem" }}>Amount</th>
          <th style={{ textAlign: "center", padding: "0.5rem" }}>Status</th>
          <th style={{ textAlign: "center", padding: "0.5rem" }}>PDF</th>
        </tr>
      </thead>
      <tbody>
        {invoices.map((inv) => (
          <tr
            key={inv.id}
            style={{
              borderBottom: "1px solid var(--nozle-border, var(--border))",
              fontSize: "0.875rem",
            }}
          >
            <td
              style={{
                padding: "0.5rem",
                color:
                  "var(--nozle-muted-foreground, var(--muted-foreground))",
              }}
            >
              {inv.number}
            </td>
            <td style={{ padding: "0.5rem" }}>{formatDate(inv.date)}</td>
            <td
              style={{
                textAlign: "right",
                padding: "0.5rem",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: inv.currency ?? "USD",
              }).format(inv.amount / 100)}
            </td>
            <td style={{ textAlign: "center", padding: "0.5rem" }}>
              <span
                style={{
                  ...(STATUS_STYLES[inv.status] ?? STATUS_STYLES.draft),
                  padding: "0.125rem 0.5rem",
                  borderRadius: "9999px",
                  fontSize: "0.75rem",
                  fontWeight: 500,
                }}
              >
                {inv.status}
              </span>
            </td>
            <td style={{ textAlign: "center", padding: "0.5rem" }}>
              {inv.pdf_url ? (
                <a
                  href={inv.pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Download invoice ${inv.number}`}
                  style={{
                    color: "var(--nozle-primary, var(--primary))",
                    textDecoration: "underline",
                    fontSize: "0.75rem",
                  }}
                >
                  Download
                </a>
              ) : (
                <span
                  style={{
                    color:
                      "var(--nozle-muted-foreground, var(--muted-foreground))",
                    fontSize: "0.75rem",
                  }}
                >
                  —
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
