import type { CanResult } from "./types";

export async function can(
  baseUrl: string,
  apiKey: string,
  customerId: string,
  feature: string,
  metadata?: Record<string, unknown>,
  timeout = 10_000,
): Promise<CanResult> {
  const url = new URL(`${baseUrl}/api/v1/can`);
  url.searchParams.set("customer_id", customerId);
  url.searchParams.set("feature", feature);
  if (metadata) {
    url.searchParams.set("metadata", JSON.stringify(metadata));
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(timeout),
  });

  if (!res.ok) {
    throw new Error(`can check failed: ${res.status} ${res.statusText}`);
  }

  return res.json();
}
