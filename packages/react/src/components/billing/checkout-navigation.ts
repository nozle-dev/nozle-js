export function navigateToCheckout(
  url: string,
  location: Pick<Location, "assign"> = window.location,
): void {
  location.assign(url);
}
