import type { CreditBalance } from "./types";

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
}
