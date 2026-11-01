import { afterEach, describe, expect, it, vi } from "vitest";
import { CustomerTaxErrorCode, Nozle, NozleApiError, type Invoice } from "../index";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
afterEach(() => fetchMock.mockReset());

const json = (body: unknown, status = 200, statusText = "OK") => new Response(JSON.stringify(body), { status, statusText });
const client = () => new Nozle({ apiKey: "sk_test", baseUrl: "https://api.example/engine", eventsUrl: "https://api.example/core", maxRetries: 0 });
const sentCustomer = () => JSON.parse(fetchMock.mock.calls[0][1].body).customer;

describe("customers.upsert tax data", () => {
  it("maps address and tax ID to Core's keys and returns the tax fields", async () => {
    fetchMock.mockResolvedValueOnce(
      json({ customer: { external_id: "c1", tax_identification_type: "eu_vat", tax_identification_status: "pending", tax_treatment: "pending", tax_identification_warnings: ["country_mismatch"] } }),
    );
    const result = await client().customers.upsert({
      externalId: "c1",
      customerType: "company",
      legalName: "Acme GmbH",
      address: { line1: "Main St 1", line2: "Top", city: "Berlin", state: "BE", postalCode: "10115", country: "DE" },
      shippingAddress: { line1: "Dock 2", country: "DE" },
      taxId: { type: "eu_vat", value: "DE811128135" },
    });
    expect(sentCustomer()).toEqual({
      external_id: "c1",
      customer_type: "company",
      legal_name: "Acme GmbH",
      address_line1: "Main St 1",
      address_line2: "Top",
      city: "Berlin",
      state: "BE",
      zipcode: "10115",
      country: "DE",
      shipping_address: { address_line1: "Dock 2", country: "DE" },
      tax_identification_number: "DE811128135",
      tax_identification_type: "eu_vat",
    });
    expect(result.tax_identification_status).toBe("pending");
    expect(result.tax_identification_warnings).toEqual(["country_mismatch"]);
  });

  it("sends a null number to clear the tax ID", async () => {
    fetchMock.mockResolvedValueOnce(json({ customer: { external_id: "c1" } }));
    await client().customers.upsert({ externalId: "c1", taxId: null });
    expect(sentCustomer()).toEqual({ external_id: "c1", tax_identification_number: null });
  });

  it("refuses a tax ID without a value before any request", async () => {
    await expect(client().customers.upsert({ externalId: "c1", taxId: { type: "eu_vat", value: " " } })).rejects.toThrow("taxId requires");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("exposes Core's validation codes through hasCode", async () => {
    fetchMock.mockResolvedValueOnce(
      json({ status: 422, code: "validation_errors", error_details: { tax_identification_number: ["invalid_format"] } }, 422, "Unprocessable Entity"),
    );
    const error = await client().customers.upsert({ externalId: "c1", taxId: { type: "eu_vat", value: "x" } }).catch((e) => e);
    expect(error).toBeInstanceOf(NozleApiError);
    expect(error.hasCode(CustomerTaxErrorCode.InvalidFormat)).toBe(true);
    expect(error.hasCode(CustomerTaxErrorCode.ValueIsInvalid)).toBe(false);
  });
});

describe("customers.get and waitForTaxCheck", () => {
  it("gets a customer by escaped external ID", async () => {
    fetchMock.mockResolvedValueOnce(json({ customer: { external_id: "a/b", tax_treatment: "reverse_charge" } }));
    const customer = await client().customers.get("a/b");
    expect(customer.tax_treatment).toBe("reverse_charge");
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.example/core/api/v1/customers/a%2Fb");
    expect(fetchMock.mock.calls[0][1].method).toBe("GET");
  });

  it("polls until the status is not pending", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ customer: { external_id: "c1", tax_identification_status: "pending" } }))
      .mockResolvedValueOnce(json({ customer: { external_id: "c1", tax_identification_status: "valid" } }));
    const customer = await client().customers.waitForTaxCheck("c1", { intervalMs: 1 });
    expect(customer.tax_identification_status).toBe("valid");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("times out while the check stays pending", async () => {
    fetchMock.mockImplementation(async () => json({ customer: { external_id: "c1", tax_identification_status: "pending" } }));
    await expect(client().customers.waitForTaxCheck("c1", { timeoutMs: 20, intervalMs: 5 })).rejects.toThrow("timed out");
  });
});

describe("checkout tax refusals", () => {
  it("reads customer_tax_check_pending with retry_after_seconds", async () => {
    fetchMock.mockResolvedValueOnce(json({ status: 409, code: "customer_tax_check_pending", retry_after_seconds: 30 }, 409, "Conflict"));
    const error = await client().checkout("c1", "pro").catch((e) => e);
    expect(error.hasCode(CustomerTaxErrorCode.TaxCheckPending)).toBe(true);
    expect(error.retryAfterSeconds).toBe(30);
  });

  it("reads customer_tax_location_required details", async () => {
    fetchMock.mockResolvedValueOnce(
      json({ status: 422, code: "customer_tax_location_required", error_details: { customer: ["country_missing"] } }, 422, "Unprocessable Entity"),
    );
    const error = await client().checkout("c1", "pro").catch((e) => e);
    expect(error.hasCode(CustomerTaxErrorCode.TaxLocationRequired)).toBe(true);
    expect(error.hasCode("country_missing")).toBe(true);
  });
});

it("types invoice tax fields", () => {
  const invoice = { tax_status: "succeeded", tax_treatment: "reverse_charge", tax_details: { treatment: "reverse_charge" } } as Invoice;
  expect(invoice.tax_details?.treatment).toBe("reverse_charge");
});
