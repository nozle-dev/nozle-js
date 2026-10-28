import { request, type RequestPolicy } from "./http";
import { apiError } from "./errors";
import type { MarginByCustomer, MarginByMetric, MarginByModel, MarginByPlan, MarginForecast, MarginSummary, MarginTrend, MarginQueryParams, MarginSimulateParams, MarginSimulation, TrendParams } from "./types";

export class MarginClient {
  private readonly base: string;
  private readonly headers: Record<string, string>;
  private readonly policy: RequestPolicy;

  constructor(baseUrl: string, apiKey: string, policy: RequestPolicy) {
    this.base = `${baseUrl}/api/v1/margin`;
    this.headers = { Authorization: `Bearer ${apiKey}` };
    this.policy = policy;
  }

  private async get<T = unknown>(path: string, params?: Record<string, string | undefined>): Promise<T> {
    const url = new URL(`${this.base}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) url.searchParams.set(k, v);
      }
    }

    const res = await request(this.policy, url, {
      headers: this.headers,
    });

    if (!res.ok) {
      throw await apiError(`margin${path}`, res);
    }

    return res.json();
  }

  summary(params?: MarginQueryParams) {
    return this.get<MarginSummary>("/summary", params);
  }

  byCustomer(params?: MarginQueryParams) {
    return this.get<MarginByCustomer>("/customers", params);
  }

  byMetric(params?: MarginQueryParams) {
    return this.get<MarginByMetric>("/metrics", params);
  }

  byPlan(params?: MarginQueryParams) {
    return this.get<MarginByPlan>("/plans", params);
  }

  byModel(params?: MarginQueryParams) {
    return this.get<MarginByModel>("/models", params);
  }

  trend(params?: TrendParams) {
    const { granularity = "day", ...rest } = params ?? {};
    return this.get<MarginTrend>("/trend", { granularity, ...rest });
  }

  /** Daily revenue, cost and margin projected for the 30 days after the range (default: the last month). */
  forecast(params?: MarginQueryParams): Promise<MarginForecast> {
    return this.get("/forecast", params);
  }

  /** Replays one metric's recorded usage in the range at a new unit price; the recorded cost is kept. */
  async simulate(params: MarginSimulateParams, range?: MarginQueryParams): Promise<MarginSimulation> {
    if (!params.metricCode?.trim()) throw new Error("margin.simulate requires metricCode");
    if (!Number.isFinite(params.newPriceDollars) || params.newPriceDollars < 0)
      throw new Error("margin.simulate newPriceDollars must be a number of 0 or more");
    const url = new URL(`${this.base}/simulate`);
    for (const [k, v] of Object.entries(range ?? {})) if (v !== undefined) url.searchParams.set(k, v);
    // A simulation only reads, so it is safe to retry.
    const res = await request(this.policy, url, {
      method: "POST",
      headers: { ...this.headers, "Content-Type": "application/json" },
      body: JSON.stringify({ metric_code: params.metricCode, new_price_dollars: params.newPriceDollars }),
    }, { idempotent: true });
    if (!res.ok) throw await apiError("margin/simulate", res);
    return res.json();
  }
}
