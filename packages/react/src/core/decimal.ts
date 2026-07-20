interface ParsedDecimal {
  sign: 1 | -1;
  integer: string;
  fraction: string;
}

function parseDecimal(value: string): ParsedDecimal | null {
  const match = value.trim().match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  const rawInteger = match[2] ?? "0";
  let firstIntegerDigit = 0;
  while (
    firstIntegerDigit < rawInteger.length - 1 &&
    rawInteger[firstIntegerDigit] === "0"
  ) {
    firstIntegerDigit += 1;
  }
  const integer = rawInteger.slice(firstIntegerDigit);
  const rawFraction = match[3] ?? "";
  let fractionEnd = rawFraction.length;
  while (fractionEnd > 0 && rawFraction[fractionEnd - 1] === "0") {
    fractionEnd -= 1;
  }
  const fraction = rawFraction.slice(0, fractionEnd);
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
  const firstGroupLength = parsed.integer.length % 3 || 3;
  const groups = [parsed.integer.slice(0, firstGroupLength)];
  for (
    let index = firstGroupLength;
    index < parsed.integer.length;
    index += 3
  ) {
    groups.push(parsed.integer.slice(index, index + 3));
  }
  const groupedInteger = groups.join(",");
  const fraction = parsed.fraction.slice(0, fractionLimit);
  return `${parsed.sign < 0 ? "-" : ""}${groupedInteger}${fraction ? `.${fraction}` : ""}`;
}

export function creditUnitLabel(value: string, unitName: string): string {
  return compareDecimalStrings(value, "1") === 0 ? unitName : `${unitName}s`;
}
