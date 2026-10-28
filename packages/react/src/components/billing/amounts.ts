import { portalTimezones } from "../portal/timezones.js";

/**
 * Minor units per major unit, matching Core's Money gem (Money 7.0.2, including legacy MRO).
 * Core's `*_cents` fields are these minor units, not always hundredths. Intl's currency digits
 * differ from Core for some currencies (HUF, MRO), so they are not used.
 */
const CURRENCY_FACTORS: Record<string, number> = {
  BHD: 1000, BIF: 1, CLF: 10000, CLP: 1, DJF: 1, GNF: 1, HUF: 1,
  IQD: 1000, ISK: 1, JOD: 1000, JPY: 1, KMF: 1, KRW: 1, KWD: 1000,
  LYD: 1000, MGA: 1, MRO: 5, OMR: 1000, PYG: 1, RWF: 1, TND: 1000,
  UGX: 1, VND: 1, VUV: 1, XAF: 1, XOF: 1, XPF: 1,
};

/** Minor units per major unit of `currency` (100 unless Core says otherwise). */
export function currencyFactor(currency: string): number {
  return CURRENCY_FACTORS[currency.toUpperCase()] ?? 100;
}

/** Decimal places shown for `currency`: 0 for JPY, 3 for KWD, 1 for MRO. */
export function currencyDigits(currency: string): number {
  return Math.ceil(Math.log10(currencyFactor(currency)));
}

export interface FormatMinorAmountOptions {
  /** Omit the fraction (for example ".00") when the amount is a whole number of major units. */
  trimZeroFraction?: boolean;
}

/** Format integer minor units without converting billing amounts to floating point. */
export function formatMinorAmount(
  value: string | number,
  currency: string,
  locale = "en-US",
  options: FormatMinorAmountOptions = {},
): string {
  const raw = String(value);
  if (
    !/^-?\d+$/.test(raw) ||
    (typeof value === "number" && !Number.isSafeInteger(value))
  ) {
    return "Amount unavailable";
  }
  try {
    const digits = currencyDigits(currency);
    const formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    const minor = BigInt(raw);
    const absolute = minor < 0n ? -minor : minor;
    const factor = BigInt(currencyFactor(currency));
    const whole = absolute / factor;
    const signed = minor < 0n ? (whole === 0n ? -0 : -whole) : whole;
    // Exact: the factor is a power of ten or MRO's 5.
    const remainder = (absolute % factor) * 10n ** BigInt(digits) / factor;
    const trim = options.trimZeroFraction === true && remainder === 0n;
    const decimal = String(remainder).padStart(digits, "0");
    const digitFormatter = new Intl.NumberFormat(locale, {
      useGrouping: false,
    });
    const fraction = [...decimal]
      .map((digit) => digitFormatter.format(Number(digit)))
      .join("");
    return formatter
      .formatToParts(signed)
      .filter(
        (part) => !trim || (part.type !== "fraction" && part.type !== "decimal"),
      )
      .map((part) => (part.type === "fraction" ? fraction : part.value))
      .join("");
  } catch {
    return "Amount unavailable";
  }
}

export function formatBillingDate(
  value: string | null,
  locale = "en-US",
  timezone?: string,
): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "Not available";
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeZone: timezone?.startsWith("TZ_")
        ? (portalTimezones[timezone] ?? "UTC")
        : (timezone ?? "UTC"),
    }).format(new Date(value));
  } catch {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(new Date(value));
  }
}
