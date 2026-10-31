import { NozleApiError, apiError } from "./errors";
import { request, type RequestPolicy } from "./http";

export type CreditNote = import("./generated/openapi").components["schemas"]["CreditNoteObject"];

/** Why the credit note is issued. Core stores one of these; it defaults to `other`. */
export type CreditNoteReason =
  | "duplicated_charge"
  | "product_unsatisfactory"
  | "order_change"
  | "order_cancellation"
  | "fraudulent_charge"
  | "other";

/** One invoice fee, and how much of it (in cents, before tax) the credit note covers. */
export interface CreditNoteItem {
  /** `fees[].nozle_id` of the invoice. */
  feeId: string;
  amountCents: number;
}

export interface PreviewCreditNoteParams {
  /** `nozle_id` of a finalized invoice. */
  invoiceId: string;
  items: CreditNoteItem[];
}

/**
 * What a credit note for these items would be worth, with taxes and coupons applied. Nothing is created.
 * `maxRefundableAmountCents` is what has been paid and not yet refunded, capped at the total.
 */
export interface CreditNotePreview {
  invoice_id: string;
  invoice_number: string;
  currency: string;
  taxes_amount_cents: number;
  precise_taxes_amount_cents: string | number;
  taxes_rate: number;
  sub_total_excluding_taxes_amount_cents: number;
  max_creditable_amount_cents: number;
  max_refundable_amount_cents: number;
  /** Sent by newer Core versions only. */
  max_offsettable_amount_cents?: number;
  coupons_adjustment_amount_cents: number;
  precise_coupons_adjustment_amount_cents: number;
  items: { fee_id: string | null; amount_cents: number }[];
  applied_taxes?: Record<string, unknown>[];
}

export interface CreateCreditNoteParams extends PreviewCreditNoteParams {
  /**
   * How the credit note's total is settled. The three amounts must add up to the total of `items`
   * with taxes (take it from `preview()`); at least one must be above zero.
   * - `creditAmountCents`: added to the customer's balance, applied to their next invoice.
   * - `refundAmountCents`: returned to the customer's original payment method by the payment provider.
   *   Only up to what was paid on the invoice and not refunded yet.
   * - `offsetAmountCents`: deducted from what the customer still owes on the invoice.
   */
  creditAmountCents?: number;
  refundAmountCents?: number;
  offsetAmountCents?: number;
  reason?: CreditNoteReason;
  /** Printed on the credit note PDF. */
  description?: string;
  /** Your own key-value pairs, for example your ticket number. Values are strings. */
  metadata?: Record<string, string | null>;
}

export interface RefundParams extends PreviewCreditNoteParams {
  reason?: CreditNoteReason;
  description?: string;
  metadata?: Record<string, string | null>;
  /**
   * When less was paid than the items are worth, refund what was paid and credit the rest to the customer's
   * balance. Without it `refund()` throws `refund_exceeds_paid_amount` and creates nothing.
   */
  creditRemainder?: boolean;
}

export interface ListCreditNotesOptions {
  /** Only this customer's credit notes. */
  customerId?: string;
  invoiceNumber?: string;
  reason?: CreditNoteReason;
  creditStatus?: "available" | "consumed" | "voided";
  refundStatus?: "pending" | "succeeded" | "failed";
  currency?: string;
  /** Inclusive dates, `YYYY-MM-DD`. */
  issuingDateFrom?: string;
  issuingDateTo?: string;
  amountFrom?: number;
  amountTo?: number;
  page?: number;
  perPage?: number;
}

export interface CreditNotePage {
  credit_notes: CreditNote[];
  meta: { current_page: number; next_page: number | null; prev_page: number | null; total_pages: number; total_count: number };
}

/**
 * Codes Core puts in `NozleApiError.code` or `errorDetails` for credit notes; test with `error.hasCode(...)`.
 * `refund_exceeds_paid_amount` is raised by this SDK's `refund()`, the rest by Core.
 */
export const CREDIT_NOTE_ERROR_CODES = {
  /** Invoice is a draft, an old version, or an unpaid prepaid-credit invoice (HTTP 422). */
  invalidTypeOrStatus: "invalid_type_or_status",
  /** `refundAmountCents` on an invoice nothing was paid on. */
  cannotRefundUnpaidInvoice: "cannot_refund_unpaid_invoice",
  /** An amount is above what is left on the invoice (paid for refunds, creditable for credits). */
  higherThanRemainingInvoiceAmount: "higher_than_remaining_invoice_amount",
  /** An item is above what is left of its fee. */
  higherThanRemainingFeeAmount: "higher_than_remaining_fee_amount",
  /** credit + refund + offset do not add up to the items with taxes. */
  doesNotMatchItemAmounts: "does_not_match_item_amounts",
  totalAmountMustBePositive: "total_amount_must_be_positive",
  /** Void of a credit note with nothing left to void (HTTP 422). */
  noVoidableAmount: "no_voidable_amount",
  refundExceedsPaidAmount: "refund_exceeds_paid_amount",
} as const;

const REASONS = ["duplicated_charge", "product_unsatisfactory", "order_change", "order_cancellation", "fraudulent_charge", "other"];

function need(value: string | undefined, operation: string, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${operation} requires ${name}`);
  return value;
}

function cents(value: number | undefined, operation: string, name: string): void {
  if (value !== undefined && (!Number.isInteger(value) || value < 0)) throw new Error(`${operation} ${name} must be a whole number of cents, 0 or more`);
}

function checkItems(items: CreditNoteItem[], operation: string): { fee_id: string; amount_cents: number }[] {
  if (!Array.isArray(items) || items.length === 0) throw new Error(`${operation} requires at least one item`);
  return items.map((item) => {
    need(item?.feeId, operation, "items[].feeId");
    cents(item.amountCents, operation, "items[].amountCents");
    if (item.amountCents === undefined) throw new Error(`${operation} requires items[].amountCents`);
    return { fee_id: item.feeId, amount_cents: item.amountCents };
  });
}

function checkReason(reason: string | undefined, operation: string): void {
  if (reason !== undefined && !REASONS.includes(reason)) throw new Error(`${operation} reason must be one of ${REASONS.join(", ")}`);
}

export class CreditNotesNamespace {
  constructor(
    private readonly coreUrl: string,
    private readonly apiKey: string,
    private readonly policy: RequestPolicy,
  ) {}

  /** What a credit note for these items would be worth. Creates nothing, so it is safe to retry. */
  async preview(params: PreviewCreditNoteParams): Promise<CreditNotePreview> {
    const op = "creditNotes.preview";
    const body = { credit_note: { invoice_id: need(params?.invoiceId, op, "invoiceId"), items: checkItems(params.items, op) } };
    return (await this.call<{ estimated_credit_note: CreditNotePreview }>(op, "POST", "/api/v1/credit_notes/estimate", body, true)).estimated_credit_note;
  }

  /**
   * Issues a credit note. It sends no `Idempotency-Key` yet, so the SDK never retries it: if it fails
   * with a network error or a 5xx, call `list({ customerId, invoiceNumber })` before trying again.
   * A refund is started with the payment provider after the call returns; follow `refund_status`
   * with `get()` or the `credit_note.refund_failure` webhook.
   */
  async create(params: CreateCreditNoteParams): Promise<CreditNote> {
    const op = "creditNotes.create";
    const credit_note: Record<string, unknown> = { invoice_id: need(params?.invoiceId, op, "invoiceId"), items: checkItems(params.items, op) };
    cents(params.creditAmountCents, op, "creditAmountCents");
    cents(params.refundAmountCents, op, "refundAmountCents");
    cents(params.offsetAmountCents, op, "offsetAmountCents");
    checkReason(params.reason, op);
    if (!((params.creditAmountCents ?? 0) + (params.refundAmountCents ?? 0) + (params.offsetAmountCents ?? 0) > 0))
      throw new Error(`${op} requires creditAmountCents, refundAmountCents or offsetAmountCents above zero`);
    const optional: [string, unknown][] = [
      ["credit_amount_cents", params.creditAmountCents],
      ["refund_amount_cents", params.refundAmountCents],
      ["offset_amount_cents", params.offsetAmountCents],
      ["reason", params.reason],
      ["description", params.description],
      ["metadata", params.metadata],
    ];
    for (const [key, value] of optional) if (value !== undefined) credit_note[key] = value;
    return (await this.call<{ credit_note: CreditNote }>(op, "POST", "/api/v1/credit_notes", { credit_note })).credit_note;
  }

  /**
   * Refunds the items to the customer's original payment method: `preview()` for the exact total, then
   * `create()` with that total as `refundAmountCents`. Two calls, and the second is not retried.
   */
  async refund(params: RefundParams): Promise<CreditNote> {
    const op = "creditNotes.refund";
    const preview = await this.preview(params);
    const total = preview.max_creditable_amount_cents;
    const refundable = Math.min(preview.max_refundable_amount_cents, total);
    const remainder = total - refundable;
    if (refundable <= 0 || (remainder > 0 && !params.creditRemainder)) {
      const error = new NozleApiError(op, { status: 422, statusText: "Unprocessable Entity" }, { code: CREDIT_NOTE_ERROR_CODES.refundExceedsPaidAmount });
      error.message = `${op} failed: ${refundable} of ${total} cents can be refunded (paid and not refunded yet)` +
        (refundable > 0 ? "; pass creditRemainder: true to credit the rest" : "");
      throw error;
    }
    return this.create({
      invoiceId: params.invoiceId,
      items: params.items,
      refundAmountCents: refundable,
      ...(remainder > 0 && { creditAmountCents: remainder }),
      ...(params.reason && { reason: params.reason }),
      ...(params.description !== undefined && { description: params.description }),
      ...(params.metadata && { metadata: params.metadata }),
    });
  }

  /** Credit notes, newest first; all of them, or one customer's with `customerId`. */
  async list(options: ListCreditNotesOptions = {}): Promise<CreditNotePage> {
    const query = new URLSearchParams();
    const fields: [keyof ListCreditNotesOptions, string][] = [
      ["customerId", "external_customer_id"],
      ["invoiceNumber", "invoice_number"],
      ["reason", "reason"],
      ["creditStatus", "credit_status"],
      ["refundStatus", "refund_status"],
      ["currency", "currency"],
      ["issuingDateFrom", "issuing_date_from"],
      ["issuingDateTo", "issuing_date_to"],
      ["amountFrom", "amount_from"],
      ["amountTo", "amount_to"],
      ["page", "page"],
      ["perPage", "per_page"],
    ];
    for (const [option, param] of fields) if (options[option] !== undefined) query.set(param, String(options[option]));
    const suffix = query.size > 0 ? `?${query}` : "";
    return this.call<CreditNotePage>("creditNotes.list", "GET", `/api/v1/credit_notes${suffix}`);
  }

  async get(creditNoteId: string): Promise<CreditNote> {
    const op = "creditNotes.get";
    return (await this.call<{ credit_note: CreditNote }>(op, "GET", `/api/v1/credit_notes/${encodeURIComponent(need(creditNoteId, op, "creditNoteId"))}`)).credit_note;
  }

  /**
   * Voids what is left of the credit note's credit balance. It does not undo a refund that was paid out
   * or an offset already applied. Throws `no_voidable_amount` (422) when nothing is left. Never retried.
   */
  async void(creditNoteId: string): Promise<CreditNote> {
    const op = "creditNotes.void";
    return (await this.call<{ credit_note: CreditNote }>(op, "PUT", `/api/v1/credit_notes/${encodeURIComponent(need(creditNoteId, op, "creditNoteId"))}/void`)).credit_note;
  }

  private async call<T>(operation: string, method: string, path: string, body?: unknown, idempotent = false): Promise<T> {
    if (!this.apiKey.startsWith("sk_")) throw new Error("creditNotes require a secret key");
    const response = await request(this.policy, `${this.coreUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.apiKey}`, ...(body !== undefined && { "Content-Type": "application/json" }) },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    }, { idempotent });
    if (!response.ok) throw await apiError(operation, response);
    return (await response.json()) as T;
  }
}
