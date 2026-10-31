import { afterEach, describe, expect, it, vi } from "vitest";
import { CREDIT_NOTE_ERROR_CODES, Nozle, NozleApiError } from "../index";

const note = { nozle_id: "cn_1", number: "INV-1-CN1", refund_amount_cents: 600, refund_status: "pending", reason: "duplicated_charge" };
const preview = (refundable: number, creditable = 600) => ({
  estimated_credit_note: { invoice_id: "inv_1", invoice_number: "INV-1", currency: "USD", max_creditable_amount_cents: creditable, max_refundable_amount_cents: refundable, items: [] },
});
const items = [{ feeId: "fee_1", amountCents: 500 }];

type Handler = (init: RequestInit, url: URL) => Response;
function stub(routes: Record<string, Handler>) {
  const fetch = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const route = routes[`${init.method ?? "GET"} ${url.pathname}`];
    if (!route) throw new Error(`unexpected ${init.method ?? "GET"} ${url}`);
    return route(init, url);
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
const body = (call: unknown[]) => JSON.parse(String((call[1] as RequestInit).body));
const nozle = (maxRetries = 2) => new Nozle({ apiKey: "sk_test", host: "https://api.example", maxRetries, retryDelayMs: 1 });
const core = "/core/api/v1/credit_notes";
const failure = (status: number, json: unknown) => new Response(JSON.stringify(json), { status, statusText: "Err", headers: { "content-type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("creditNotes", () => {
  it("previews with the Core estimate body and returns the estimate", async () => {
    const fetch = stub({ [`POST ${core}/estimate`]: () => Response.json(preview(500)) });
    const result = await nozle().creditNotes.preview({ invoiceId: "inv_1", items });
    expect(result.max_refundable_amount_cents).toBe(500);
    expect(body(fetch.mock.calls[0])).toEqual({ credit_note: { invoice_id: "inv_1", items: [{ fee_id: "fee_1", amount_cents: 500 }] } });
    expect((fetch.mock.calls[0][1] as RequestInit).headers).toMatchObject({ Authorization: "Bearer sk_test" });
  });

  it("retries a preview (it creates nothing)", async () => {
    let n = 0;
    const fetch = stub({ [`POST ${core}/estimate`]: () => (++n < 3 ? failure(503, {}) : Response.json(preview(1))) });
    await nozle().creditNotes.preview({ invoiceId: "inv_1", items });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("creates with credit, refund and offset amounts, reason, description and metadata", async () => {
    const fetch = stub({ [`POST ${core}`]: () => Response.json({ credit_note: note }) });
    const created = await nozle().creditNotes.create({
      invoiceId: "inv_1", items, refundAmountCents: 400, creditAmountCents: 100, offsetAmountCents: 100,
      reason: "order_cancellation", description: "Cancelled", metadata: { ticket: "T-1" },
    });
    expect(created.nozle_id).toBe("cn_1");
    expect(body(fetch.mock.calls[0])).toEqual({
      credit_note: {
        invoice_id: "inv_1", items: [{ fee_id: "fee_1", amount_cents: 500 }], credit_amount_cents: 100, refund_amount_cents: 400,
        offset_amount_cents: 100, reason: "order_cancellation", description: "Cancelled", metadata: { ticket: "T-1" },
      },
    });
    expect((fetch.mock.calls[0][1] as RequestInit).headers).not.toHaveProperty("Idempotency-Key");
  });

  it("never retries create or void, even after a 503 or a network error", async () => {
    const fetch = stub({
      [`POST ${core}`]: () => failure(503, {}),
      [`PUT ${core}/cn_1/void`]: () => { throw new TypeError("fetch failed"); },
    });
    await expect(nozle().creditNotes.create({ invoiceId: "inv_1", items, refundAmountCents: 500 })).rejects.toMatchObject({ status: 503 });
    await expect(nozle().creditNotes.void("cn_1")).rejects.toThrow("fetch failed");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("refund previews, then refunds exactly the previewed total", async () => {
    const fetch = stub({
      [`POST ${core}/estimate`]: () => Response.json(preview(600)),
      [`POST ${core}`]: () => Response.json({ credit_note: note }),
    });
    await nozle().creditNotes.refund({ invoiceId: "inv_1", items, reason: "duplicated_charge", metadata: { t: "1" } });
    expect(body(fetch.mock.calls[1]).credit_note).toEqual({
      invoice_id: "inv_1", items: [{ fee_id: "fee_1", amount_cents: 500 }], refund_amount_cents: 600, reason: "duplicated_charge", metadata: { t: "1" },
    });
  });

  it("refund refuses to create anything when less was paid, unless creditRemainder is set", async () => {
    const fetch = stub({
      [`POST ${core}/estimate`]: () => Response.json(preview(250)),
      [`POST ${core}`]: () => Response.json({ credit_note: note }),
    });
    const error = await nozle().creditNotes.refund({ invoiceId: "inv_1", items }).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(NozleApiError);
    expect((error as NozleApiError).hasCode(CREDIT_NOTE_ERROR_CODES.refundExceedsPaidAmount)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    await nozle().creditNotes.refund({ invoiceId: "inv_1", items, creditRemainder: true });
    expect(body(fetch.mock.calls[2]).credit_note).toMatchObject({ refund_amount_cents: 250, credit_amount_cents: 350 });
  });

  it("refund throws on an invoice with nothing paid, even with creditRemainder", async () => {
    stub({ [`POST ${core}/estimate`]: () => Response.json(preview(0)) });
    await expect(nozle().creditNotes.refund({ invoiceId: "inv_1", items, creditRemainder: true })).rejects.toMatchObject({ code: "refund_exceeds_paid_amount" });
  });

  it("lists with filters as Core query parameters, and without any", async () => {
    const fetch = stub({ [`GET ${core}`]: () => Response.json({ credit_notes: [note], meta: { current_page: 2 } }) });
    const page = await nozle().creditNotes.list({
      customerId: "cus 1", invoiceNumber: "INV-1", reason: "other", creditStatus: "available", refundStatus: "failed", currency: "USD",
      issuingDateFrom: "2026-01-01", issuingDateTo: "2026-02-01", amountFrom: 1, amountTo: 9, page: 2, perPage: 5,
    });
    expect(page.credit_notes[0].nozle_id).toBe("cn_1");
    expect(Object.fromEntries(new URL(String(fetch.mock.calls[0][0])).searchParams)).toEqual({
      external_customer_id: "cus 1", invoice_number: "INV-1", reason: "other", credit_status: "available", refund_status: "failed", currency: "USD",
      issuing_date_from: "2026-01-01", issuing_date_to: "2026-02-01", amount_from: "1", amount_to: "9", page: "2", per_page: "5",
    });
    await nozle().creditNotes.list();
    expect(String(fetch.mock.calls[1][0])).toBe(`https://api.example${core}`);
  });

  it("gets and voids a credit note by id", async () => {
    stub({
      [`GET ${core}/cn%201`]: () => Response.json({ credit_note: note }),
      [`PUT ${core}/cn_1/void`]: () => Response.json({ credit_note: { ...note, credit_status: "voided" } }),
    });
    expect((await nozle().creditNotes.get("cn 1")).number).toBe("INV-1-CN1");
    expect((await nozle().creditNotes.void("cn_1")).credit_status).toBe("voided");
  });

  describe("errors", () => {
    it("422 validation errors carry Core's codes", async () => {
      stub({ [`POST ${core}`]: () => failure(422, { status: 422, error: "Unprocessable Entity", code: "validation_errors", error_details: { refund_amount_cents: ["higher_than_remaining_invoice_amount"] } }) });
      const error = (await nozle().creditNotes.create({ invoiceId: "inv_1", items, refundAmountCents: 9 }).catch((c: unknown) => c)) as NozleApiError;
      expect(error).toBeInstanceOf(NozleApiError);
      expect(error.status).toBe(422);
      expect(error.hasCode(CREDIT_NOTE_ERROR_CODES.higherThanRemainingInvoiceAmount)).toBe(true);
    });

    it("422 business rules: invoice type or status, and no voidable amount", async () => {
      stub({
        [`POST ${core}/estimate`]: () => failure(422, { status: 422, error: "Unprocessable Entity", code: "invalid_type_or_status" }),
        [`PUT ${core}/cn_1/void`]: () => failure(422, { status: 422, error: "Unprocessable Entity", code: "no_voidable_amount" }),
      });
      await expect(nozle().creditNotes.preview({ invoiceId: "inv_1", items })).rejects.toMatchObject({ status: 422, code: "invalid_type_or_status" });
      await expect(nozle().creditNotes.void("cn_1")).rejects.toMatchObject({ status: 422, code: "no_voidable_amount" });
    });

    it("403 feature_unavailable when credit notes are not enabled (premium), 404 for a missing resource, 401 for a bad key", async () => {
      stub({
        [`POST ${core}`]: () => failure(403, { status: 403, error: "Forbidden", code: "feature_unavailable" }),
        [`GET ${core}/cn_x`]: () => failure(404, { status: 404, error: "Not Found", code: "credit_note_not_found" }),
        [`GET ${core}`]: () => failure(401, { status: 401, error: "Unauthorized" }),
      });
      await expect(nozle().creditNotes.create({ invoiceId: "inv_1", items, creditAmountCents: 1 })).rejects.toMatchObject({ status: 403, code: "feature_unavailable" });
      await expect(nozle().creditNotes.get("cn_x")).rejects.toMatchObject({ status: 404, code: "credit_note_not_found" });
      await expect(nozle().creditNotes.list()).rejects.toMatchObject({ status: 401 });
    });
  });

  describe("input checks (nothing is sent)", () => {
    it.each([
      ["a secret key", () => new Nozle({ apiKey: "pk_test", host: "https://api.example" }).creditNotes.get("cn_1"), "secret key"],
      ["an invoice id", () => nozle().creditNotes.preview({ invoiceId: " ", items }), "invoiceId"],
      ["items", () => nozle().creditNotes.preview({ invoiceId: "inv_1", items: [] }), "at least one item"],
      ["whole cents", () => nozle().creditNotes.create({ invoiceId: "inv_1", items: [{ feeId: "f", amountCents: 1.5 }], creditAmountCents: 1 }), "whole number"],
      ["a settlement amount", () => nozle().creditNotes.create({ invoiceId: "inv_1", items }), "above zero"],
      ["a negative refund", () => nozle().creditNotes.create({ invoiceId: "inv_1", items, refundAmountCents: -1 }), "refundAmountCents"],
      ["a known reason", () => nozle().creditNotes.create({ invoiceId: "inv_1", items, creditAmountCents: 1, reason: "bored" as never }), "reason must be one of"],
      ["a credit note id to get", () => nozle().creditNotes.get(""), "creditNoteId"],
      ["a credit note id to void", () => nozle().creditNotes.void(""), "creditNoteId"],
    ])("needs %s", async (_name, call, message) => {
      const fetch = stub({});
      await expect(call()).rejects.toThrow(message);
      expect(fetch).not.toHaveBeenCalled();
    });
  });
});
