/** One charge's usage in a period, as returned by Core's `current_usage` and `past_usage`. */
export interface ChargeUsageData {
  /** Decimal string, for example `"1200.0"`. */
  units: string;
  amount_cents: number;
  amount_currency: string;
  events_count?: number;
  charge: { nozle_id: string; charge_model: string; invoice_display_name?: string | null };
  feature: { nozle_id: string; code: string; name: string; aggregation_type?: string };
}

/**
 * A customer's usage for one billing period: the `customer_usage` object of
 * `GET /customers/{external_customer_id}/current_usage`, or one item of `usage_periods` in
 * `GET /customers/{external_customer_id}/past_usage`. Read them on your backend with a secret key.
 */
export interface CustomerUsageData {
  from_datetime: string;
  to_datetime: string;
  currency: string;
  amount_cents: number;
  charges_usage: ChargeUsageData[];
}

export function formatAmount(amountCents: number, currency: string): string {
  const amount = amountCents / 100;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function formatDay(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" });
}
