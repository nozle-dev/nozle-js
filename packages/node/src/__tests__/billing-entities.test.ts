import { afterEach, describe, expect, it, vi } from "vitest";
import { Nozle, NozleApiError } from "../index";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
afterEach(() => fetchMock.mockReset());

const json = (body: unknown, status = 200, statusText = "OK") => new Response(JSON.stringify(body), { status, statusText });
const client = (apiKey = "sk_test") => new Nozle({ apiKey, baseUrl: "https://api.example/engine", eventsUrl: "https://api.example/core", maxRetries: 0 });
const sent = () => ({ url: fetchMock.mock.calls[0][0], init: fetchMock.mock.calls[0][1] });

describe("billingEntities", () => {
  it("lists entities with the Stripe Tax fields", async () => {
    fetchMock.mockResolvedValueOnce(json({ billing_entities: [{ code: "de", tax_provider: "stripe_tax", provider_tax_code: "txcd_10000000" }] }));
    const result = await client().billingEntities.list();
    expect(sent().url).toBe("https://api.example/core/api/v1/billing_entities");
    expect(result[0].tax_provider).toBe("stripe_tax");
    expect(result[0].provider_tax_code).toBe("txcd_10000000");
  });

  it("gets one entity by encoded code", async () => {
    fetchMock.mockResolvedValueOnce(json({ billing_entity: { code: "a/b", taxes: [] } }));
    const entity = await client().billingEntities.get("a/b");
    expect(sent().url).toBe("https://api.example/core/api/v1/billing_entities/a%2Fb");
    expect(entity.taxes).toEqual([]);
  });

  it("creates with Core's wrapped snake_case body and skips undefined fields", async () => {
    fetchMock.mockResolvedValueOnce(json({ billing_entity: { code: "de", tax_provider: "stripe_tax" } }));
    await client().billingEntities.create({
      code: "de",
      name: "Acme GmbH",
      taxProvider: "stripe_tax",
      providerTaxCode: "txcd_10000000",
      zipcode: undefined,
      billingConfiguration: { invoiceGracePeriod: 3, documentLocale: "de" },
    });
    const { init } = sent();
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      billing_entity: {
        code: "de",
        name: "Acme GmbH",
        tax_provider: "stripe_tax",
        provider_tax_code: "txcd_10000000",
        billing_configuration: { invoice_grace_period: 3, document_locale: "de" },
      },
    });
  });

  it("updates with PUT and the applied tax codes", async () => {
    fetchMock.mockResolvedValueOnce(json({ billing_entity: { code: "de", tax_provider: "nozle" } }));
    await client().billingEntities.update("de", { taxProvider: "nozle", euTaxManagement: true, taxCodes: ["vat"] });
    const { url, init } = sent();
    expect(url).toBe("https://api.example/core/api/v1/billing_entities/de");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ billing_entity: { tax_provider: "nozle", eu_tax_management: true, tax_codes: ["vat"] } });
  });

  it("surfaces Core's tax provider conflict as NozleApiError and does not retry a write", async () => {
    fetchMock.mockResolvedValue(json({ status: 422, error: "Unprocessable Entity", code: "validation_errors", error_details: { tax_provider: ["conflicts_with_eu_tax_management"] } }, 422, "Unprocessable Entity"));
    const error = await client().billingEntities.update("de", { taxProvider: "stripe_tax" }).catch((e) => e);
    expect(error).toBeInstanceOf(NozleApiError);
    expect(error.status).toBe(422);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("validates arguments and requires a secret key", async () => {
    await expect(client().billingEntities.get(" ")).rejects.toThrow("requires code");
    await expect(client().billingEntities.create({ code: "x", name: "" })).rejects.toThrow("requires name");
    await expect(client("pk_test").billingEntities.list()).rejects.toThrow("secret key");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
