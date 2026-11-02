import { apiError } from "./errors";
import { request, type RequestPolicy } from "./http";

type Schemas = import("./generated/openapi").components["schemas"];

/** Who computes tax for a billing entity: `nozle` (taxes and EU VAT rules) or `stripe_tax`. */
export type BillingEntityTaxProvider = "nozle" | "stripe_tax";

/** Fields Core adds to a billing entity for Stripe Tax; older Cores leave them out. */
export interface BillingEntityTaxFields {
  tax_provider?: BillingEntityTaxProvider;
  /** Stripe product tax code, for example `txcd_10000000`; used when `tax_provider` is `stripe_tax`. */
  provider_tax_code?: string | null;
  customer_location_required?: boolean;
  einvoicing?: boolean;
}

export type BillingEntity = Schemas["BillingEntityObject"] & BillingEntityTaxFields;
/** What `get` and `update` return: the entity with its applied `taxes` and `selected_invoice_custom_sections`. */
export type BillingEntityDetails = Schemas["BillingEntityObjectExtended"] & BillingEntityTaxFields;

/** Core's `billing_configuration`, camelCase. */
export interface BillingEntityConfiguration {
  invoiceFooter?: string;
  invoiceGracePeriod?: number;
  subscriptionInvoiceIssuingDateAnchor?: "current_period_end" | "next_period_start";
  subscriptionInvoiceIssuingDateAdjustment?: "align_with_finalization_date" | "keep_anchor";
  documentLocale?: string;
}

export interface UpdateBillingEntityParams {
  name?: string;
  einvoicing?: boolean;
  email?: string;
  legalName?: string;
  legalNumber?: string;
  taxIdentificationNumber?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zipcode?: string;
  /** ISO 3166-1 alpha-2, for example `DE`. */
  country?: string;
  defaultCurrency?: string;
  timezone?: string;
  documentNumbering?: "per_customer" | "per_billing_entity";
  documentNumberPrefix?: string;
  finalizeZeroAmountInvoice?: boolean;
  netPaymentTerm?: number;
  /** Cannot be on together with `taxProvider: "stripe_tax"`; Core answers 422. */
  euTaxManagement?: boolean;
  customerLocationRequired?: boolean;
  taxProvider?: BillingEntityTaxProvider;
  providerTaxCode?: string;
  emailSettings?: string[];
  billingConfiguration?: BillingEntityConfiguration;
}

export interface CreateBillingEntityParams extends UpdateBillingEntityParams {
  code: string;
  name: string;
}

/** `update` only: replace the applied taxes and invoice custom sections by code. */
export interface UpdateBillingEntityAppliedParams extends UpdateBillingEntityParams {
  taxCodes?: string[];
  invoiceCustomSectionCodes?: string[];
}

const FIELDS: [keyof UpdateBillingEntityAppliedParams, string][] = [
  ["name", "name"],
  ["einvoicing", "einvoicing"],
  ["email", "email"],
  ["legalName", "legal_name"],
  ["legalNumber", "legal_number"],
  ["taxIdentificationNumber", "tax_identification_number"],
  ["addressLine1", "address_line1"],
  ["addressLine2", "address_line2"],
  ["city", "city"],
  ["state", "state"],
  ["zipcode", "zipcode"],
  ["country", "country"],
  ["defaultCurrency", "default_currency"],
  ["timezone", "timezone"],
  ["documentNumbering", "document_numbering"],
  ["documentNumberPrefix", "document_number_prefix"],
  ["finalizeZeroAmountInvoice", "finalize_zero_amount_invoice"],
  ["netPaymentTerm", "net_payment_term"],
  ["euTaxManagement", "eu_tax_management"],
  ["customerLocationRequired", "customer_location_required"],
  ["taxProvider", "tax_provider"],
  ["providerTaxCode", "provider_tax_code"],
  ["emailSettings", "email_settings"],
  ["taxCodes", "tax_codes"],
  ["invoiceCustomSectionCodes", "invoice_custom_section_codes"],
];

const CONFIGURATION: [keyof BillingEntityConfiguration, string][] = [
  ["invoiceFooter", "invoice_footer"],
  ["invoiceGracePeriod", "invoice_grace_period"],
  ["subscriptionInvoiceIssuingDateAnchor", "subscription_invoice_issuing_date_anchor"],
  ["subscriptionInvoiceIssuingDateAdjustment", "subscription_invoice_issuing_date_adjustment"],
  ["documentLocale", "document_locale"],
];

function need(value: string | undefined, operation: string, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${operation} requires ${name}`);
  return value;
}

function wire(params: UpdateBillingEntityAppliedParams): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const [option, key] of FIELDS) if (params[option] !== undefined) body[key] = params[option];
  if (params.billingConfiguration) {
    const configuration: Record<string, unknown> = {};
    for (const [option, key] of CONFIGURATION) if (params.billingConfiguration[option] !== undefined) configuration[key] = params.billingConfiguration[option];
    body.billing_configuration = configuration;
  }
  return body;
}

/** Billing entities: the legal entities that issue invoices, including their tax provider (`nozle` or `stripe_tax`). */
export class BillingEntitiesNamespace {
  constructor(
    private readonly coreUrl: string,
    private readonly apiKey: string,
    private readonly policy: RequestPolicy,
  ) {}

  async list(): Promise<BillingEntity[]> {
    return (await this.call<{ billing_entities: BillingEntity[] }>("billingEntities.list", "GET", "/api/v1/billing_entities")).billing_entities;
  }

  async get(code: string): Promise<BillingEntityDetails> {
    const op = "billingEntities.get";
    return (await this.call<{ billing_entity: BillingEntityDetails }>(op, "GET", this.path(need(code, op, "code")))).billing_entity;
  }

  /** Creates an entity. It sends no `Idempotency-Key`, so it is never retried; a duplicate `code` answers 422. */
  async create(params: CreateBillingEntityParams): Promise<BillingEntity> {
    const op = "billingEntities.create";
    need(params?.code, op, "code");
    need(params.name, op, "name");
    return (await this.call<{ billing_entity: BillingEntity }>(op, "POST", "/api/v1/billing_entities", { billing_entity: { code: params.code, ...wire(params) } })).billing_entity;
  }

  /** Changes the given fields only. Switching to `taxProvider: "stripe_tax"` needs `euTaxManagement` off. Never retried. */
  async update(code: string, params: UpdateBillingEntityAppliedParams): Promise<BillingEntityDetails> {
    const op = "billingEntities.update";
    return (await this.call<{ billing_entity: BillingEntityDetails }>(op, "PUT", this.path(need(code, op, "code")), { billing_entity: wire(params ?? {}) })).billing_entity;
  }

  private path(code: string): string {
    return `/api/v1/billing_entities/${encodeURIComponent(code)}`;
  }

  private async call<T>(operation: string, method: string, path: string, body?: unknown): Promise<T> {
    if (!this.apiKey.startsWith("sk_")) throw new Error("billingEntities require a secret key");
    const response = await request(this.policy, `${this.coreUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.apiKey}`, ...(body !== undefined && { "Content-Type": "application/json" }) },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    }, { idempotent: method === "GET" });
    if (!response.ok) throw await apiError(operation, response);
    return (await response.json()) as T;
  }
}
