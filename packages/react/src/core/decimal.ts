interface ParsedDecimal {
  sign: 1 | -1;
  integer: string;
  fraction: string;
}

function parseDecimal(value: string): ParsedDecimal | null {
  const match = value.trim().match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  const integer = (match[2] ?? "0").replace(/^0+(?=\d)/, "");
  const fraction = (match[3] ?? "").replace(/0+$/, "");
  const zero = integer === "0" && fraction === "";
  return {
    sign: !zero && match[1] === "-" ? -1 : 1,
    integer,
    fraction,
  };
}

export function compareDecimalStrings(left: string, right: string): number {
  const a = parseDecimal(left);
  const b = parseDecimal(right);
  if (!a || !b) throw new Error("invalid decimal value");
  if (a.sign !== b.sign) return a.sign > b.sign ? 1 : -1;

  let magnitude = 0;
  if (a.integer.length !== b.integer.length) {
    magnitude = a.integer.length > b.integer.length ? 1 : -1;
  } else if (a.integer !== b.integer) {
    magnitude = a.integer > b.integer ? 1 : -1;
  } else {
    const width = Math.max(a.fraction.length, b.fraction.length);
    const aFraction = a.fraction.padEnd(width, "0");
    const bFraction = b.fraction.padEnd(width, "0");
    if (aFraction !== bFraction) magnitude = aFraction > bFraction ? 1 : -1;
  }
  return magnitude * a.sign;
}

export function formatDecimalString(
  value: string,
  maximumFractionDigits = 12,
): string {
  const parsed = parseDecimal(value);
  if (!parsed) return value;
  const fractionLimit = Math.max(
    0,
    Math.min(30, Math.trunc(maximumFractionDigits)),
  );
  const groupedInteger = parsed.integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = parsed.fraction.slice(0, fractionLimit);
  return `${parsed.sign < 0 ? "-" : ""}${groupedInteger}${fraction ? `.${fraction}` : ""}`;
}

export function creditUnitLabel(value: string, unitName: string): string {
  return compareDecimalStrings(value, "1") === 0 ? unitName : `${unitName}s`;
}
