import { apiError } from "./errors";
import { request, type RequestPolicy } from "./http";

export type Invoice = import("./generated/openapi").components["schemas"]["InvoiceObject"];

export interface InvoicePage {
  invoices: Invoice[];
  meta: { current_page: number; next_page: number | null; prev_page: number | null; total_pages: number; total_count: number };
}

export interface ListInvoicesOptions {
  /** `draft`, `finalized`, `voided`, `failed` or `pending`. */
  status?: string;
  /** `pending`, `succeeded` or `failed`. */
  paymentStatus?: string;
  /** Inclusive dates, `YYYY-MM-DD`. */
  issuingDateFrom?: string;
  issuingDateTo?: string;
  page?: number;
  perPage?: number;
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

  private raw(method: string, path: string, body?: unknown): Promise<Response> {
    if (!this.apiKey.startsWith("sk_")) throw new Error("invoices require a secret key");
    return request(this.policy, `${this.coreUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.apiKey}`, ...(body !== undefined && { "Content-Type": "application/json" }) },
      ...(body !== undefined && { body: JSON.stringify(body) }),
      // Every call here is a read; download only starts PDF generation once.
    }, { idempotent: true });
  }

  private async call<T>(operation: string, method: string, path: string, body?: unknown): Promise<T> {
    const response = await this.raw(method, path, body);
    if (!response.ok) throw await apiError(operation, response);
    return (await response.json()) as T;
  }
}
