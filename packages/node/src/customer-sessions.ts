import type { CustomerSession, CustomerSessionCreateParams } from "./types";

export class CustomerSessionsNamespace {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly timeout: number,
  ) {}

  async create(params: CustomerSessionCreateParams): Promise<CustomerSession> {
    if (!this.apiKey.startsWith("sk_")) {
      throw new Error("customerSessions.create requires a secret key");
    }
    if (!params.customerId.trim()) {
      throw new Error("customerSessions.create requires customerId");
    }
    if (
      params.expiresInSeconds !== undefined &&
      (params.expiresInSeconds < 60 || params.expiresInSeconds > 3600)
    ) {
      throw new Error(
        "customerSessions.create expiresInSeconds must be between 60 and 3600",
      );
    }

    const response = await fetch(`${this.baseUrl}/api/v1/customer-sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        customer_id: params.customerId,
        ...(params.expiresInSeconds !== undefined && {
          expires_in_seconds: params.expiresInSeconds,
        }),
      }),
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!response.ok) {
      throw new Error(
        `customerSessions.create failed: ${response.status} ${response.statusText}`,
      );
    }
    const data = (await response.json()) as {
      customer_session: CustomerSession;
    };
    return data.customer_session;
  }
}
