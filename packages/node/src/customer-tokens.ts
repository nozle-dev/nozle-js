import { apiError } from "./errors";
import { request, type RequestPolicy } from "./http";

/** What `customerTokens.create` returns. Hand it to the browser, for example from your `getCustomerToken` route. */
export interface CustomerToken {
  /** Send it as `X-Nozle-Customer-Token` with your publishable key. A bearer credential: never log it. */
  token: string;
  /** The customer's external id. */
  customer_id: string;
  /** ISO 8601. */
  expires_at: string;
}

export interface CreateCustomerTokenOptions {
  /** Lifetime in seconds, 60 to 3600 (one hour, also the default). Nozle answers 422 outside that range. */
  ttlSeconds?: number;
  /** Feature codes: `can` and usage reads are limited to these. Subscription and credit reads are not affected. */
  features?: string[];
}

/**
 * Short-lived, read-only tokens that let your customer's browser read that one customer's entitlements, usage,
 * credit balances and subscription with your publishable key (`@nozle-js/react` `getCustomerToken`). Secret key.
 */
export class CustomerTokensNamespace {
  constructor(
    private readonly coreUrl: string,
    private readonly apiKey: string,
    private readonly policy: RequestPolicy,
  ) {}

  /** Mints a token for the signed-in customer. Take `customerId` from your own session, never from the browser. */
  async create(customerId: string, options: CreateCustomerTokenOptions = {}): Promise<CustomerToken> {
    if (!customerId?.trim()) throw new Error("customerTokens.create requires customerId");
    const body = { customer_id: customerId, ttl_seconds: options.ttlSeconds, features: options.features };
    // A retry only mints another token.
    return this.call("customerTokens.create", "/api/v1/customer_tokens", body);
  }

  /** Refuses every customer token minted until now, for example after one leaked. Tokens minted afterwards work. */
  async revoke(): Promise<{ revoked_at: string }> {
    return this.call("customerTokens.revoke", "/api/v1/customer_tokens/revoke", {});
  }

  private async call<T>(operation: string, path: string, body: unknown): Promise<T> {
    if (!this.apiKey.startsWith("sk_")) throw new Error("customer tokens require a secret key");
    const response = await request(
      this.policy,
      `${this.coreUrl}${path}`,
      { method: "POST", headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(body) },
      { idempotent: true },
    );
    if (!response.ok) throw await apiError(operation, response);
    return (await response.json()) as T;
  }
}
