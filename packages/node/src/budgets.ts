import { request, type RequestPolicy } from "./http";
import { apiError } from "./errors";
import type { BudgetList, BudgetListOptions } from "./types";

/** Money budgets (spend limits) and their standing (Engine 2.34.0+). */
export class BudgetsNamespace {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly policy: RequestPolicy,
  ) {}

  /** Every spend limit of the customer's subscription with its spend, open holds and status in the current period. */
  async list(customerId: string, options: BudgetListOptions = {}): Promise<BudgetList> {
    if (!customerId?.trim()) throw new Error("budgets.list requires customerId");
    const url = new URL(`${this.baseUrl}/api/v1/customers/${encodeURIComponent(customerId)}/budgets`);
    if (options.subscriptionId) url.searchParams.set("subscription_id", options.subscriptionId);
    const response = await request(this.policy, url, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!response.ok) throw await apiError("budgets.list", response);
    return response.json() as Promise<BudgetList>;
  }
}
