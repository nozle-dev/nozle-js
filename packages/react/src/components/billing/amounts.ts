import { portalTimezones } from "../portal/timezones.js";

/** Format integer minor units without converting billing amounts to floating point. */
export function formatMinorAmount(
  value: string | number,
  currency: string,
  locale = "en-US",
): string {
  const raw = String(value);
  if (
    !/^-?\d+$/.test(raw) ||
    (typeof value === "number" && !Number.isSafeInteger(value))
  ) {
    return "Amount unavailable";
  }
  try {
    const formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
    });
    const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    const minor = BigInt(raw);
    const absolute = minor < 0n ? -minor : minor;
    const scale = 10n ** BigInt(digits);
    const whole = absolute / scale;
    const signed = minor < 0n ? (whole === 0n ? -0 : -whole) : whole;
    const decimal = String(absolute % scale).padStart(digits, "0");
    const digitFormatter = new Intl.NumberFormat(locale, {
      useGrouping: false,
    });
    const fraction = [...decimal]
      .map((digit) => digitFormatter.format(Number(digit)))
      .join("");
    return formatter
      .formatToParts(signed)
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
