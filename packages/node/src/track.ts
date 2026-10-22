import { request, type RequestPolicy } from "./http";
import { apiError } from "./errors";
import { createTransactionId } from "./identifiers";
import type { TrackOptions } from "./types";

export async function track(
  baseUrl: string,
  apiKey: string,
  customerId: string,
  event: string,
  metadata: Record<string, unknown> | undefined,
  options: TrackOptions | undefined,
  policy: RequestPolicy,
): Promise<string> {
  const transactionId = options?.transactionId ?? createTransactionId();
  const body: Record<string, unknown> = {
    transaction_id: transactionId,
    external_customer_id: customerId,
    code: event,
    properties: metadata ?? {},
  };

  if (options?.subscriptionId) {
    body.external_subscription_id = options.subscriptionId;
  }

  if (options?.timestamp) {
    body.timestamp = eventTimestamp(options.timestamp);
  }

  try {
    const res = await request(policy, `${baseUrl}/api/v1/events`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ event: body }),
    }, { idempotent: true });

    if (!res.ok) {
      throw await apiError(`track`, res);
    }
  } catch (error) {
    // The event may have been recorded; retrying with this ID records it once.
    if (typeof error === "object" && error !== null) Object.assign(error, { transactionId });
    throw error;
  }

  return transactionId;
}

function eventTimestamp(value: string): string {
  const seconds = Number(value);
  if (value.trim() && Number.isFinite(seconds) && seconds >= 0) {
    return value;
  }

  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new Error("track timestamp must be RFC3339 or Unix seconds");
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    throw new Error("track timestamp must be RFC3339 or Unix seconds");
  }
  return (milliseconds / 1000).toFixed(3);
}
