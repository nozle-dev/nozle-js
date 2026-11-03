import { apiError } from "./errors";
import { request, type RequestPolicy } from "./http";

import type { InvoiceTaxFields } from "./customer-tax";

/** An invoice; `tax_status`, `tax_treatment` and `tax_details` come from Cores that support customer tax data. */
export type Invoice = import("./generated/openapi").components["schemas"]["InvoiceObject"] & InvoiceTaxFields;

export interface InvoicePage {
  invoices: Invoice[];
  meta: { current_page: number; next_page: number | null; prev_page: number | null; total_pages: number; total_count: number };
}

export interface ListInvoicesOptions {
  /** `draft`, `finalized`, `voided`, `failed` or `pending`. */
  status?: string;
  /** `pending`, `succeeded` or `failed`. */
  paymentStatus?: string;
  /** Only invoices past their due date and not paid (`true`), or only the others (`false`). */
  paymentOverdue?: boolean;
  /** Inclusive dates, `YYYY-MM-DD`. */
  issuingDateFrom?: string;
  issuingDateTo?: string;
  page?: number;
  perPage?: number;
}

/**
 * Why Core refused `invoices.payWithAgentToken`. 422 codes arrive in `errorDetails.agent_payment_token` (the limit codes
 * and `invalid_format`), `stripe_required` in `errorDetails.payment_provider`; `feature_not_enabled` is a 403 and
 * `invoice_not_payable` a 422 `code`. Test with `error.hasCode(...)`.
 */
export const AgentTokenErrorCode = {
  FeatureNotEnabled: "feature_not_enabled",
  InvalidFormat: "invalid_format",
  InvoiceNotPayable: "invoice_not_payable",
  StripeRequired: "stripe_required",
  TokenDeactivated: "token_deactivated",
  TokenExpired: "token_expired",
  CurrencyMismatch: "currency_mismatch",
  AmountExceedsLimit: "amount_exceeds_limit",
} as const;
export type AgentTokenErrorCode = (typeof AgentTokenErrorCode)[keyof typeof AgentTokenErrorCode];

/**
 * Why Core refused `invoices.getX402Requirements` or `invoices.payWithX402`. `feature_not_enabled` is a 403,
 * `invoice_not_payable` a 422 `code`; `usd_required` arrives in `errorDetails.currency`, `stripe_required` in
 * `errorDetails.payment_provider` and `invalid_format` in `errorDetails.transaction_hash`. Test with `error.hasCode(...)`.
 */
export const X402ErrorCode = {
  FeatureNotEnabled: "feature_not_enabled",
  InvoiceNotPayable: "invoice_not_payable",
  UsdRequired: "usd_required",
  StripeRequired: "stripe_required",
  InvalidFormat: "invalid_format",
} as const;
export type X402ErrorCode = (typeof X402ErrorCode)[keyof typeof X402ErrorCode];

/** x402 payment requirements for an invoice (`x402Version` 2); `accepts` and `resource` are passed through from Core. */
export interface X402Requirements {
  x402Version: number;
  accepts: Record<string, unknown>[];
  resource?: Record<string, unknown>;
  [key: string]: unknown;
}

export class InvoicesNamespace {
  constructor(
    private readonly coreUrl: string,
    private readonly apiKey: string,
    private readonly policy: RequestPolicy,
  ) {}

  /** A customer's invoices, newest first. */
  async list(customerId: string, options: ListInvoicesOptions = {}): Promise<InvoicePage> {
    if (!customerId.trim()) throw new Error("invoices.list requires customerId");
    const query = new URLSearchParams({ external_customer_id: customerId });
    const fields: [keyof ListInvoicesOptions, string][] = [
      ["status", "status"],
      ["paymentStatus", "payment_status"],
      ["paymentOverdue", "payment_overdue"],
      ["issuingDateFrom", "issuing_date_from"],
      ["issuingDateTo", "issuing_date_to"],
      ["page", "page"],
      ["perPage", "per_page"],
    ];
    for (const [option, param] of fields) {
      if (options[option] !== undefined) query.set(param, String(options[option]));
    }
    return this.call<InvoicePage>("invoices.list", "GET", `/api/v1/invoices?${query}`);
  }

  async get(invoiceId: string): Promise<Invoice> {
    if (!invoiceId.trim()) throw new Error("invoices.get requires invoiceId");
    return (await this.call<{ invoice: Invoice }>("invoices.get", "GET", `/api/v1/invoices/${encodeURIComponent(invoiceId)}`)).invoice;
  }

  /**
   * The PDF's URL. A finalized invoice whose PDF does not exist yet returns `null`: Core starts
   * generating it, so ask again shortly (or wait for the `invoice.generated` webhook).
   */
  async downloadUrl(invoiceId: string): Promise<string | null> {
    if (!invoiceId.trim()) throw new Error("invoices.downloadUrl requires invoiceId");
    const response = await this.raw("POST", `/api/v1/invoices/${encodeURIComponent(invoiceId)}/download`);
    if (!response.ok) throw await apiError("invoices.downloadUrl", response);
    const text = await response.text();
    if (!text) return null;
    return (JSON.parse(text) as { invoice?: Invoice }).invoice?.file_url ?? null;
  }

  /**
   * Pays a finalized invoice with a Stripe Shared Payment Token (`spt_...`) an AI agent handed you. Returns the invoice
   * with its new payment status; a declined charge is a 200 with a failed payment, not an error. Needs the
   * `stripe_agent_payment_token` feature flag on your organization and a Stripe-connected customer. Refusals are
   * `NozleApiError`s; see {@link AgentTokenErrorCode}. Never retried: it moves money.
   */
  async payWithAgentToken(invoiceId: string, agentPaymentToken: string): Promise<Invoice> {
    if (!invoiceId.trim()) throw new Error("invoices.payWithAgentToken requires invoiceId");
    if (!agentPaymentToken.trim()) throw new Error("invoices.payWithAgentToken requires agentPaymentToken");
    const path = `/api/v1/invoices/${encodeURIComponent(invoiceId)}/pay_with_agent_token`;
    const body = { agent_payment_token: agentPaymentToken };
    return (await this.call<{ invoice: Invoice }>("invoices.payWithAgentToken", "POST", path, body, false)).invoice;
  }

  /**
   * What an x402 payer must send to settle this invoice (USDC on Base to the merchant's Stripe deposit address). Needs the
   * `stripe_x402_payments` feature flag, a USD invoice and a Stripe-connected customer. Refusals are `NozleApiError`s;
   * see {@link X402ErrorCode}. Safe to retry.
   */
  async getX402Requirements(invoiceId: string): Promise<X402Requirements> {
    if (!invoiceId.trim()) throw new Error("invoices.getX402Requirements requires invoiceId");
    const path = `/api/v1/invoices/${encodeURIComponent(invoiceId)}/x402_requirements`;
    return (await this.call<{ x402_requirements: X402Requirements }>("invoices.getX402Requirements", "GET", path)).x402_requirements;
  }

  /**
   * Records an x402 payment the payer already settled on-chain: pass the transaction hash (`0x` + 64 hex). Returns the
   * invoice; the payment is often `processing` first and the Stripe webhook finishes it. Core treats the hash as the
   * idempotency key, but the SDK never retries it on its own: it moves money. Refusals are `NozleApiError`s; see
   * {@link X402ErrorCode}.
   */
  async payWithX402(invoiceId: string, transactionHash: string): Promise<Invoice> {
    if (!invoiceId.trim()) throw new Error("invoices.payWithX402 requires invoiceId");
    if (!transactionHash.trim()) throw new Error("invoices.payWithX402 requires transactionHash");
    const path = `/api/v1/invoices/${encodeURIComponent(invoiceId)}/pay_with_x402`;
    const body = { transaction_hash: transactionHash };
    return (await this.call<{ invoice: Invoice }>("invoices.payWithX402", "POST", path, body, false)).invoice;
  }

  private raw(method: string, path: string, body?: unknown, idempotent = true): Promise<Response> {
    if (!this.apiKey.startsWith("sk_")) throw new Error("invoices require a secret key");
    return request(this.policy, `${this.coreUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.apiKey}`, ...(body !== undefined && { "Content-Type": "application/json" }) },
      ...(body !== undefined && { body: JSON.stringify(body) }),
      // Reads and download (starts PDF generation once) are safe to retry; a payment is not.
    }, { idempotent });
  }

  private async call<T>(operation: string, method: string, path: string, body?: unknown, idempotent = true): Promise<T> {
    const response = await this.raw(method, path, body, idempotent);
    if (!response.ok) throw await apiError(operation, response);
    return (await response.json()) as T;
  }
}
