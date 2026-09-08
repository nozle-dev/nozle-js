import { createCostEventId } from "./identifiers";
import type { CostEventAccepted, CostEventParams } from "./types";

export class CostEventsNamespace {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly timeout: number,
  ) {}

  createCostEventId(): string {
    return createCostEventId();
  }

  async track(params: CostEventParams): Promise<CostEventAccepted> {
    if (!this.apiKey.startsWith("sk_")) {
      throw new Error("costEvents.track requires a secret key");
    }
    if (!params.costMeterCode?.trim()) {
      throw new Error("costEvents.track requires costMeterCode");
    }
    if (!params.parentTransactionId?.trim() && !params.externalCustomerId?.trim()) {
      throw new Error("costEvents.track requires parentTransactionId or externalCustomerId");
    }

    const costEventId = params.costEventId?.trim() || createCostEventId();
    const response = await fetch(`${this.baseUrl}/api/v1/cost-events`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cost_event_id: costEventId,
        cost_meter_code: params.costMeterCode,
        ...(params.parentTransactionId && {
          parent_transaction_id: params.parentTransactionId,
        }),
        ...(params.externalCustomerId && {
          external_customer_id: params.externalCustomerId,
        }),
        ...(params.requestId && { request_id: params.requestId }),
        ...(params.operationKey && { operation_key: params.operationKey }),
        properties: params.properties ?? {},
        ...(params.timestamp !== undefined && { timestamp: params.timestamp }),
      }),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      throw new Error(`costEvents.track failed: ${response.status} ${response.statusText}`);
    }

    const body = (await response.json()) as CostEventAccepted;
    return {
      status: body.status,
      cost_event_id: body.cost_event_id || costEventId,
    };
  }
}
