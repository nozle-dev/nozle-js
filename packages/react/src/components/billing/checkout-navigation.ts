export function navigateToCheckout(
  url: string,
  location: Pick<Location, "assign"> = window.location,
): void {
  const parsed = new URL(
    url,
    typeof window !== "undefined" ? window.location.href : undefined,
  );
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && local)) {
    throw new Error("Checkout URL must use HTTPS");
  }
  if (parsed.username || parsed.password)
    throw new Error("Checkout URL must not contain credentials");
  location.assign(url);
}
