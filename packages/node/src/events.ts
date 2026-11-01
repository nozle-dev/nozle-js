import { request, type RequestPolicy } from "./http";
import { NozleApiError, NozleValidationError } from "./errors";
import { createTransactionId } from "./identifiers";
import type { EventVoidResult } from "./types";

export class EventsNamespace {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly policy: RequestPolicy,
  ) {}

  createTransactionId(): string {
    return createTransactionId();
  }

  /**
   * Voids a recorded usage event by transaction ID (`POST /events/{transaction_id}/void`, Engine). Idempotent: a
   * replay answers `status: "already_voided"`. Refusals throw `NozleApiError` with an {@link EventVoidErrorCode}
   * (`event_not_found` 404, `period_invoiced` 409, `reason_required` 422; `transaction_voided` 409 on a later `track`).
   * Retried like `track`, since a repeat has no further effect.
   */
  async void(transactionId: string, options: { reason: string }): Promise<EventVoidResult> {
    if (!this.apiKey.startsWith("sk_")) throw new Error("events.void requires a secret key");
    if (!transactionId?.trim()) throw new NozleValidationError("events.void requires transactionId");
    const reason = options?.reason;
    if (typeof reason !== "string" || reason.length < 1 || reason.length > 500)
      throw new NozleValidationError("reason must be a string of 1 to 500 characters");
    const res = await request(
      this.policy,
      `${this.baseUrl}/api/v1/events/${encodeURIComponent(transactionId)}/void`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      },
      { idempotent: true },
    );
    if (!res.ok) {
      const body = await Promise.resolve().then(() => res.json()).catch(() => undefined);
      const data = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
      // Engine names the refusal in `error`; surface it as `code` so `hasCode` works.
      throw new NozleApiError("events.void", res, typeof data.error === "string" ? { code: data.error, ...data } : body);
    }
    return res.json();
  }
}
