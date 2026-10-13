import { createTransactionId } from "./identifiers";
import type { TrackOptions } from "./types";

export async function track(
  baseUrl: string,
  apiKey: string,
  customerId: string,
  event: string,
  metadata?: Record<string, unknown>,
  options?: TrackOptions,
  timeout = 10_000,
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

  const res = await fetch(`${baseUrl}/api/v1/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ event: body }),
    signal: AbortSignal.timeout(timeout),
  });

  if (!res.ok) {
    throw new Error(`track failed: ${res.status} ${res.statusText}`);
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
