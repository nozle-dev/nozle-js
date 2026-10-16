import { apiError } from "./errors";
import { request, type RequestPolicy } from "./http";

/** Usage alerts belong to a subscription; balance alerts to one of the customer's wallets. */
export type AlertTarget = { subscriptionId: string } | { customerId: string; walletCode: string };

export type AlertType =
  | "current_usage_amount"
  | "feature_current_usage_amount"
  | "feature_current_usage_units"
  | "wallet_balance_amount"
  | "wallet_credits_balance"
  | "wallet_ongoing_balance_amount"
  | "wallet_credits_ongoing_balance";

export interface AlertThreshold {
  /** Amount in cents, units, or credits, by alert type. */
  value: string | number;
  code?: string | null;
  /** Fires again every `value` past the last threshold. At most one per alert. */
  recurring?: boolean;
}

export interface Alert {
  nozle_id: string;
  alert_type: AlertType;
  code: string;
  name: string | null;
  external_subscription_id: string | null;
  wallet_code: string | null;
  direction: "increasing" | "decreasing";
  previous_value: string | number | null;
  last_processed_at: string | null;
  thresholds: { code: string | null; value: string; recurring: boolean }[];
  feature: { code: string; name: string } | null;
  created_at: string;
}

export interface CreateAlertInput {
  alertType: AlertType;
  code: string;
  name?: string;
  /** Required for the feature_* types. */
  featureCode?: string;
  thresholds: AlertThreshold[];
}

export type UpdateAlertInput = Partial<Omit<CreateAlertInput, "alertType">>;

export class AlertsNamespace {
  constructor(
    private readonly coreUrl: string,
    private readonly apiKey: string,
    private readonly policy: RequestPolicy,
  ) {}

  async list(target: AlertTarget, options: { page?: number; perPage?: number } = {}): Promise<{ alerts: Alert[]; meta: Record<string, number | null> }> {
    const query = new URLSearchParams();
    if (options.page !== undefined) query.set("page", String(options.page));
    if (options.perPage !== undefined) query.set("per_page", String(options.perPage));
    const suffix = query.size ? `?${query}` : "";
    return this.call("alerts.list", "GET", `${this.base(target)}${suffix}`);
  }

  async get(target: AlertTarget, code: string): Promise<Alert> {
    return (await this.call<{ alert: Alert }>("alerts.get", "GET", this.one(target, code))).alert;
  }

  /** Nozle sends the `alert.triggered` webhook when a threshold is crossed. */
  async create(target: AlertTarget, input: CreateAlertInput): Promise<Alert> {
    const body = { alert: { alert_type: input.alertType, ...this.fields(input) } };
    return (await this.call<{ alert: Alert }>("alerts.create", "POST", this.base(target), body)).alert;
  }

  /** Thresholds, when given, replace the existing ones. */
  async update(target: AlertTarget, code: string, input: UpdateAlertInput): Promise<Alert> {
    return (await this.call<{ alert: Alert }>("alerts.update", "PUT", this.one(target, code), { alert: this.fields(input) })).alert;
  }

  async delete(target: AlertTarget, code: string): Promise<Alert> {
    return (await this.call<{ alert: Alert }>("alerts.delete", "DELETE", this.one(target, code))).alert;
  }

  private fields(input: UpdateAlertInput): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries({
        code: input.code,
        name: input.name,
        feature_code: input.featureCode,
        thresholds: input.thresholds?.map((t) => ({ value: String(t.value), code: t.code, recurring: t.recurring })),
      }).filter(([, value]) => value !== undefined),
    );
  }

  private base(target: AlertTarget): string {
    if ("subscriptionId" in target) {
      if (!target.subscriptionId?.trim()) throw new Error("alerts require subscriptionId");
      return `/api/v1/subscriptions/${encodeURIComponent(target.subscriptionId)}/alerts`;
    }
    if (!target.customerId?.trim() || !target.walletCode?.trim()) throw new Error("wallet alerts require customerId and walletCode");
    return `/api/v1/customers/${encodeURIComponent(target.customerId)}/wallets/${encodeURIComponent(target.walletCode)}/alerts`;
  }

  private one(target: AlertTarget, code: string): string {
    if (!code?.trim()) throw new Error("alerts require code");
    return `${this.base(target)}/${encodeURIComponent(code)}`;
  }

  private async call<T>(operation: string, method: string, path: string, body?: unknown): Promise<T> {
    if (!this.apiKey.startsWith("sk_")) throw new Error("alerts require a secret key");
    const response = await request(this.policy, `${this.coreUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.apiKey}`, ...(body !== undefined && { "Content-Type": "application/json" }) },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw await apiError(operation, response);
    return (await response.json()) as T;
  }
}
