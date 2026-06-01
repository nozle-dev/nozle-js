"use client";

/**
 * BillingPortal — self-contained customer-facing billing portal.
 * Aggregates CurrentPlan, UsageDashboard, InvoiceList, and CreditBalance
 * in a single vertical stack.
 */

import type React from "react";
import { CurrentPlan } from "./CurrentPlan.js";
import { InvoiceList } from "./InvoiceList.js";
import { CreditBalance } from "./CreditBalance.js";
import { UsageDashboard } from "../usage/UsageDashboard.js";
import type { UsageDashboardFeature } from "../usage/UsageDashboard.js";

export interface BillingPortalProps {
  customerId: string;
  usageFeatures?: UsageDashboardFeature[];
  usageLoading?: boolean;
  onChangePlan?: () => void;
  subscriptionId?: string;
  onCancelled?: () => void;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        padding: "1.25rem",
        border: "1px solid var(--nozle-border, var(--border))",
        borderRadius: "0.75rem",
        background: "var(--nozle-card, var(--card, #ffffff))",
      }}
    >
      <h3
        style={{
          fontSize: "0.875rem",
          fontWeight: 600,
          color: "var(--nozle-muted-foreground, var(--muted-foreground))",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: "1rem",
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

export function BillingPortal({
  customerId,
  usageFeatures,
  usageLoading = false,
  onChangePlan,
}: BillingPortalProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "1.25rem",
        fontFamily:
          "var(--nozle-font-sans, var(--font-sans, system-ui, sans-serif))",
        color: "var(--nozle-foreground, var(--foreground))",
      }}
    >
      <Section title="Current Plan">
        <CurrentPlan customerId={customerId} onChangePlan={onChangePlan} />
      </Section>

      <Section title="Usage">
        <UsageDashboard features={usageFeatures} loading={usageLoading} />
      </Section>

      <Section title="Invoices">
        <InvoiceList customerId={customerId} />
      </Section>

      <Section title="Credits">
        <CreditBalance customerId={customerId} />
      </Section>
    </div>
  );
}
