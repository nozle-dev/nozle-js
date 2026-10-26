import { request, type RequestPolicy } from "./http";
import { apiError } from "./errors";
import type { CanOptions, CanResult } from "./types";

export async function can(
  baseUrl: string,
  apiKey: string,
  customerId: string,
  feature: string,
  metadata: Record<string, unknown> | undefined,
  policy: RequestPolicy,
  options: CanOptions = {},
): Promise<CanResult> {
  const url = new URL(`${baseUrl}/api/v1/can`);
  url.searchParams.set("customer_id", customerId);
  url.searchParams.set("feature", feature);
  if (metadata) {
    url.searchParams.set("metadata", JSON.stringify(metadata));
  }

  if (options.subscriptionId) url.searchParams.set("subscription_id", options.subscriptionId);
  if (options.entityId) url.searchParams.set("entity_id", options.entityId);

  const res = await request(policy, url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    throw await apiError(`can check`, res);
  }

  return res.json();
}
