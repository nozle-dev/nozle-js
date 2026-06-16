import type { MarginQueryParams, TrendParams } from "./types";

export class MarginClient {
  private readonly base: string;
  private readonly headers: Record<string, string>;
  private readonly timeout: number;

  constructor(baseUrl: string, apiKey: string, timeout = 10_000) {
    this.base = `${baseUrl}/api/v1/margin`;
    this.headers = { Authorization: `Bearer ${apiKey}` };
    this.timeout = timeout;
  }

  private async get<T = unknown>(path: string, params?: Record<string, string | undefined>): Promise<T> {
    const url = new URL(`${this.base}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) url.searchParams.set(k, v);
      }
    }

    const res = await fetch(url, {
      headers: this.headers,
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!res.ok) {
      throw new Error(`margin${path} failed: ${res.status} ${res.statusText}`);
    }

    return res.json();
  }

  summary(params?: MarginQueryParams) {
    return this.get("/summary", params);
  }

  byCustomer(params?: MarginQueryParams) {
    return this.get("/customers", params);
  }

  byMetric(params?: MarginQueryParams) {
    return this.get("/metrics", params);
  }

  byPlan(params?: MarginQueryParams) {
    return this.get("/plans", params);
  }

  byModel(params?: MarginQueryParams) {
    return this.get("/models", params);
  }

  trend(params?: TrendParams) {
    const { granularity = "day", ...rest } = params ?? {};
    return this.get("/trend", { granularity, ...rest });
  }
}
