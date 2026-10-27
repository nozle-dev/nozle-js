import { request, type RequestPolicy } from "./http";
import { apiError } from "./errors";
import type {
  CostIntelligenceReport,
  CostIntelligenceReportParams,
  SharedCostAllocationParams,
  SharedCostAllocationPreview,
  SharedCostAllocationRun,
} from "./types";

/** Ledger-backed cost reporting and Shared Period Cost allocation (Engine, secret keys). */
export class CostIntelligenceNamespace {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly policy: RequestPolicy,
  ) {}

  /** Cost totals, feature and customer breakdowns, ledger entries and the review queues for a period. */
  async report(params: CostIntelligenceReportParams = {}): Promise<CostIntelligenceReport> {
    this.requireSecretKey("costIntelligence.report");
    const url = new URL(`${this.baseUrl}/api/v1/cost-intelligence/report`);
    if (params.from) url.searchParams.set("from", params.from);
    if (params.to) url.searchParams.set("to", params.to);
    if (params.limit !== undefined) url.searchParams.set("limit", String(params.limit));
    const res = await request(this.policy, url, { headers: { Authorization: `Bearer ${this.apiKey}` } });
    if (!res.ok) throw await apiError("costIntelligence.report", res);
    return res.json();
  }

  /** The recognized amount and customer split of one pool's period, without writing anything. */
  previewSharedCostAllocation(poolId: string, params: SharedCostAllocationParams): Promise<SharedCostAllocationPreview> {
    return this.allocation("previewSharedCostAllocation", "preview", poolId, params);
  }

  /** Books a closed period of one pool now (Nozle also does it within about 15 minutes of the close). Repeating it is safe. */
  allocateSharedCost(poolId: string, params: SharedCostAllocationParams): Promise<SharedCostAllocationRun> {
    return this.allocation("allocateSharedCost", "allocate", poolId, params);
  }

  private async allocation<T>(name: string, action: string, poolId: string, params: SharedCostAllocationParams): Promise<T> {
    const operation = `costIntelligence.${name}`;
    this.requireSecretKey(operation);
    if (!poolId?.trim()) throw new Error(`${operation} requires poolId`);
    if (!params?.allocationPeriodStart?.trim()) throw new Error(`${operation} requires allocationPeriodStart`);
    const res = await request(
      this.policy,
      `${this.baseUrl}/api/v1/cost-intelligence/shared-costs/${encodeURIComponent(poolId)}/${action}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ allocation_period_start: params.allocationPeriodStart }),
      },
      // A preview only reads, and the Engine makes a repeated allocation of the same period return the first run.
      { idempotent: true },
    );
    if (!res.ok) throw await apiError(operation, res);
    return res.json();
  }

  private requireSecretKey(operation: string): void {
    if (!this.apiKey.startsWith("sk_")) throw new Error(`${operation} requires a secret key`);
  }
}
