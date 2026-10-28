/** Exact decimal multiplication for wallet limit comparisons; the server calculates the final bill. */
export function walletAmountCents(
  credits: string,
  rate: number,
  currencyFactor: number,
): string | null {
  if (
    !/^\d{1,30}(\.\d{1,5})?$/.test(credits) ||
    !Number.isFinite(rate) ||
    rate <= 0
  )
    return null;
  const decimal = (value: string) => {
    const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(value)!;
    return {
      value: BigInt(match[1] + (match[2] ?? "")),
      scale: (match[2]?.length ?? 0) - Number(match[3] ?? 0),
    };
  };
  const left = decimal(credits),
    right = decimal(String(rate));
  // Split the factor into multiplier * 10^digits (MRO's factor is 5).
  let multiplier = currencyFactor,
    digits = 0;
  while (multiplier >= 10 && multiplier % 10 === 0) {
    multiplier /= 10;
    digits += 1;
  }
  const coefficient = left.value * right.value * BigInt(multiplier);
  const scale = left.scale + right.scale - digits;
  if (scale <= 0) return String(coefficient * 10n ** BigInt(-scale));
  const padded = String(coefficient).padStart(scale + 1, "0");
  return `${padded.slice(0, -scale)}.${padded.slice(-scale)}`;
}
