import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentTokenErrorCode, Nozle, NozleApiError, createBillingHandler } from "../index";

const CORE = "https://api.example/core/api/v1";
const invoice = { nozle_id: "inv_1", number: "INV-1", file_url: "https://files.example/inv_1.pdf", customer: { external_id: "cus_1" } };

function stub(routes: Record<string, (init: RequestInit, url: URL) => Response>) {
  const fetch = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const route = routes[`${init.method ?? "GET"} ${url.pathname}`];
    if (!route) throw new Error(`unexpected ${init.method ?? "GET"} ${url}`);
    return route(init, url);
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const nozle = () => new Nozle({ apiKey: "sk_test", host: "https://api.example" });
afterEach(() => vi.unstubAllGlobals());

describe("invoices", () => {
  it("lists a customer's invoices with the filters as Core query parameters", async () => {
    const fetch = stub({ "GET /core/api/v1/invoices": () => Response.json({ invoices: [invoice], meta: { current_page: 2 } }) });
    const page = await nozle().invoices.list("cus 1", { status: "finalized", paymentStatus: "failed", paymentOverdue: true, page: 2, perPage: 5 });
    expect(page.invoices[0].number).toBe("INV-1");
    const url = new URL(String(fetch.mock.calls[0][0]));
    expect(Object.fromEntries(url.searchParams)).toEqual({
      external_customer_id: "cus 1", status: "finalized", payment_status: "failed", payment_overdue: "true", page: "2", per_page: "5",
    });
  });

  it("returns the PDF URL, or null while Core is still generating it", async () => {
    stub({
      "POST /core/api/v1/invoices/inv_1/download": () => Response.json({ invoice }),
      "POST /core/api/v1/invoices/inv_2/download": () => new Response(null, { status: 200 }),
    });
    expect(await nozle().invoices.downloadUrl("inv_1")).toBe("https://files.example/inv_1.pdf");
    expect(await nozle().invoices.downloadUrl("inv_2")).toBeNull();
  });

  it("pays with an agent token, sends the token in the body and returns the invoice", async () => {
    const fetch = stub({ "POST /core/api/v1/invoices/inv%201/pay_with_agent_token": () => Response.json({ invoice: { ...invoice, payment_status: "succeeded" } }) });
    const paid = await nozle().invoices.payWithAgentToken("inv 1", "spt_abc");
    expect(paid.payment_status).toBe("succeeded");
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({ agent_payment_token: "spt_abc" });
  });

  it("reads the refusal code and never retries a payment", async () => {
    const fetch = stub({
      "POST /core/api/v1/invoices/inv_1/pay_with_agent_token": () =>
        Response.json({ status: 422, error: "Unprocessable Entity", code: "validation_errors", error_details: { agent_payment_token: ["token_expired"] } }, { status: 422 }),
    });
    const error = await nozle().invoices.payWithAgentToken("inv_1", "spt_abc").catch((e) => e);
    expect(error).toBeInstanceOf(NozleApiError);
    expect(error.hasCode(AgentTokenErrorCode.TokenExpired)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    const down = stub({ "POST /core/api/v1/invoices/inv_1/pay_with_agent_token": () => new Response("{}", { status: 503 }) });
    await expect(new Nozle({ apiKey: "sk_test", host: "https://api.example", maxRetries: 3 }).invoices.payWithAgentToken("inv_1", "spt_abc")).rejects.toThrow();
    expect(down).toHaveBeenCalledTimes(1);
  });

  it("needs a secret key", async () => {
    await expect(new Nozle({ apiKey: "pk_test", host: "https://api.example" }).invoices.get("inv_1")).rejects.toThrow("secret key");
  });
});

describe("billing handler invoice routes", () => {
  const get = (path: string) => new Request(`https://app.example/api/nozle/${path}`);

  it("lists only the session customer's finalized invoices", async () => {
    const fetch = stub({ "GET /core/api/v1/invoices": () => Response.json({ invoices: [invoice], meta: {} }) });
    const handler = createBillingHandler(nozle(), { getCustomerId: () => "cus_1" });
    const response = await handler(get("invoices?page=3&external_customer_id=cus_2"));
    expect(response.status).toBe(200);
    const url = new URL(String(fetch.mock.calls[0][0]));
    expect(url.searchParams.get("external_customer_id")).toBe("cus_1");
    expect(url.searchParams.get("status")).toBe("finalized");
    expect(url.searchParams.get("page")).toBe("3");
  });

  it("downloads the session customer's invoice and answers 404 for anyone else's", async () => {
    stub({
      "GET /core/api/v1/invoices/inv_1": () => Response.json({ invoice }),
      "POST /core/api/v1/invoices/inv_1/download": () => Response.json({ invoice }),
    });
    const own = createBillingHandler(nozle(), { getCustomerId: () => "cus_1" });
    expect(await (await own(get("invoice-download?id=inv_1"))).json()).toEqual({ url: "https://files.example/inv_1.pdf" });
    const other = createBillingHandler(nozle(), { getCustomerId: () => "cus_2" });
    const response = await other(get("invoice-download?id=inv_1"));
    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe("invoice_not_found");
  });
});
