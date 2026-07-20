import { randomUUID } from "node:crypto";

import type { TrackOptions } from "./types";

export async function track(
  eventsUrl: string,
  apiKey: string,
  customerId: string,
  event: string,
  metadata?: Record<string, unknown>,
  options?: TrackOptions,
  timeout = 10_000,
): Promise<void> {
  const body: Record<string, unknown> = {
    transaction_id: options?.transactionId ?? randomUUID(),
    external_customer_id: customerId,
    code: event,
    properties: metadata ?? {},
  };

  if (options?.subscriptionId) {
    body.external_subscription_id = options.subscriptionId;
  }

  if (options?.timestamp) {
    body.timestamp = options.timestamp;
  }

  const res = await fetch(`${eventsUrl}/api/v1/events`, {
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
}
