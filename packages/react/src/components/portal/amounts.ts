/** Exact decimal multiplication for wallet limit comparisons; the server calculates the final bill. */
export function walletAmountCents(
  credits: string,
  rate: number,
  currencyDigits: number,
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
  const coefficient = left.value * right.value;
  const scale = left.scale + right.scale - currencyDigits;
  if (scale <= 0) return String(coefficient * 10n ** BigInt(-scale));
  const padded = String(coefficient).padStart(scale + 1, "0");
  return `${padded.slice(0, -scale)}.${padded.slice(-scale)}`;
}
