import type {
  CreditBalance,
  CreditBalances,
  CreditOperationPage,
  CreditOperationQuery,
} from "./types";

export class CreditsNamespace {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly timeout: number,
  ) {}

  async getBalance(customerId: string, creditSystemCode: string): Promise<CreditBalance> {
    if (!customerId.trim()) throw new Error("credits.getBalance requires customerId");
    if (!creditSystemCode.trim()) {
      throw new Error("credits.getBalance requires creditSystemCode");
    }

    const response = await fetch(
      `${this.baseUrl}/api/v1/customers/${encodeURIComponent(customerId)}/credit-systems/${encodeURIComponent(creditSystemCode)}/balance`,
      {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(this.timeout),
      },
    );
    if (!response.ok) {
      throw new Error(`credits.getBalance failed: ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<CreditBalance>;
  }

  async listBalances(customerId: string): Promise<CreditBalances> {
    if (!customerId.trim()) throw new Error("credits.listBalances requires customerId");

    const response = await fetch(
      `${this.baseUrl}/api/v1/customers/${encodeURIComponent(customerId)}/credit-systems`,
      {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(this.timeout),
      },
    );
    if (!response.ok) {
      throw new Error(`credits.listBalances failed: ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<CreditBalances>;
  }

  async listOperations(
    customerId: string,
    query: CreditOperationQuery = {},
  ): Promise<CreditOperationPage> {
    if (!customerId.trim()) throw new Error("credits.listOperations requires customerId");
    if (query.limit !== undefined && (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 100)) {
      throw new Error("credits.listOperations limit must be an integer between 1 and 100");
    }

    const url = new URL(
      `${this.baseUrl}/api/v1/customers/${encodeURIComponent(customerId)}/credit-operations`,
    );
    if (query.creditSystemCode) url.searchParams.set("credit_system_code", query.creditSystemCode);
    if (query.limit !== undefined) url.searchParams.set("limit", String(query.limit));
    if (query.cursor) url.searchParams.set("cursor", query.cursor);

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!response.ok) {
      throw new Error(`credits.listOperations failed: ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<CreditOperationPage>;
  }
}
