import { request, type RequestPolicy } from "./http";
import { apiError, CUSTOMER_PAYMENT_OVERDUE } from "./errors";
import type { CanOptions, CanResult } from "./types";

export async function can(
  baseUrl: string,
  apiKey: string,
  customerId: string,
  feature: string,
  metadata: Record<string, string | number | boolean> | undefined,
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
    const error = await apiError(`can check`, res);
    // A blocked customer is a denial, not a failure; other 402s (workspace_suspended, card_required) still throw.
    if (error.status === 402 && error.code === CUSTOMER_PAYMENT_OVERDUE) {
      return { allowed: false, reason: CUSTOMER_PAYMENT_OVERDUE, used: 0, limit: null, remaining: null };
    }
    throw error;
  }

  return res.json();
}
