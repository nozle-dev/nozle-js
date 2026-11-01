/**
 * Customer tax data. The ID types are Stripe's list; Core owns validation (`value_is_invalid`,
 * `value_is_mandatory`, `invalid_format`), so a type a newer Core adds still type-checks as a plain string.
 */
export const TAX_ID_TYPES = [
  "ad_nrt", "ae_trn", "al_tin", "am_tin", "ao_tin", "ar_cuit", "au_abn", "au_arn", "ba_tin", "bb_tin", "bg_uic",
  "bh_vat", "bo_tin", "br_cnpj", "br_cpf", "bs_tin", "by_tin", "ca_bn", "ca_gst_hst", "ca_pst_bc", "ca_pst_mb",
  "ca_pst_sk", "ca_qst", "cd_nif", "ch_uid", "ch_vat", "cl_tin", "cn_tin", "co_nit", "cr_tin", "de_stn", "do_rcn",
  "ec_ruc", "eg_tin", "es_cif", "eu_oss_vat", "eu_vat", "gb_vat", "ge_vat", "gn_nif", "hk_br", "hr_oib", "hu_tin",
  "id_npwp", "il_vat", "in_gst", "is_vat", "jp_cn", "jp_rn", "jp_trn", "ke_pin", "kg_tin", "kh_tin", "kr_brn",
  "kz_bin", "li_uid", "li_vat", "ma_vat", "md_vat", "me_pib", "mk_vat", "mr_nif", "mx_rfc", "my_frp", "my_itn",
  "my_sst", "ng_tin", "no_vat", "no_voec", "np_pan", "nz_gst", "om_vat", "pe_ruc", "ph_tin", "ro_tin", "rs_pib",
  "ru_inn", "ru_kpp", "sa_vat", "sg_gst", "sg_uen", "si_tin", "sn_ninea", "sr_fin", "sv_nit", "th_vat", "tj_tin",
  "tr_tin", "tw_vat", "tz_vat", "ua_vat", "ug_tin", "us_ein", "uy_ruc", "uz_tin", "uz_vat", "ve_rif", "vn_tin",
  "za_vat", "zm_tin", "zw_tin",
] as const;

/** A tax ID type. Known values autocomplete; any other string is accepted so a new Core value does not break callers. */
export type TaxIdType = (typeof TAX_ID_TYPES)[number] | (string & {});

/** `unverified` (stored, not checked), `pending` (VIES check running), `valid`, `invalid`. */
export type TaxIdStatus = "unverified" | "pending" | "valid" | "invalid";

/** How tax applies to the customer: `provider` is an external tax provider, `pending` a VIES hold, `none` no EU tax management. */
export type TaxTreatment = "standard" | "reverse_charge" | "exempt" | "provider" | "pending" | "none";

export type CustomerType = "company" | "individual";

export interface CustomerAddress {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  /** ISO 3166-1 alpha-2, for example `DE`. */
  country?: string;
}

export interface CustomerTaxId {
  type: TaxIdType;
  value: string;
}

/** Tax fields Core adds to a customer; present on Core versions that support customer tax data. */
export interface CustomerTaxFields {
  tax_identification_type?: TaxIdType | null;
  tax_identification_status?: TaxIdStatus;
  tax_treatment?: TaxTreatment;
  /** Non-blocking notes on a write, for example `country_mismatch`. Only on upsert responses. */
  tax_identification_warnings?: string[];
}

/** Invoice tax fields Core adds on finalization; `tax_details` is null on older invoices. */
export interface InvoiceTaxFields {
  tax_status?: "pending" | "succeeded" | "failed" | null;
  tax_treatment?: TaxTreatment;
  tax_details?: InvoiceTaxDetails | null;
}

export interface InvoiceTaxDetails {
  treatment?: TaxTreatment;
  tax_identification_number?: string | null;
  tax_identification_type?: TaxIdType | null;
  tax_identification_status?: TaxIdStatus;
  tax_identification_consultation_number?: string | null;
  customer_country?: string | null;
  seller_tax_identification_number?: string | null;
}

/** Wire form of a {@link CustomerAddress}: Core's flat keys. */
export function addressToWire(address: CustomerAddress): Record<string, string | undefined> {
  return {
    address_line1: address.line1,
    address_line2: address.line2,
    city: address.city,
    state: address.state,
    zipcode: address.postalCode,
    country: address.country,
  };
}
