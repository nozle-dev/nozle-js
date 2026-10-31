/**
 * Error thrown when a call returns a non-2xx response. The message is
 * `<operation> failed: <status> <statusText>`, followed by `: <server message>` when Nozle sent one;
 * `code` and `errorDetails` carry the rest of what Nozle returned.
 */
export class NozleApiError extends Error {
  readonly status: number;
  /** Top-level `code`, for example `payment_provider_required`, `validation_errors` or `invalid_date_range`. */
  readonly code?: string;
  /** Raw `error_details` object of a `validation_errors` response, for example `{ base: ["razorpay_requires_inr"] }`. */
  readonly errorDetails?: Record<string, unknown>;
  /** The `X-Request-Id` response header, when the service sent one. Quote it to support. */
  readonly requestId?: string;
  /** Seconds to wait before retrying, from the `Retry-After` header, when the service sent one. */
  readonly retryAfter?: number;
  /** Set by `track()`: the event's transaction ID. Pass it back as `transactionId` when you retry, so the event is recorded once. */
  transactionId?: string;

  constructor(
    operation: string,
    response: { status: number; statusText: string; headers?: Pick<Headers, "get"> },
    body?: unknown,
  ) {
    super(`${operation} failed: ${response.status} ${response.statusText}${serverText(body)}`);
    this.name = "NozleApiError";
    this.status = response.status;
    const requestId = response.headers?.get("x-request-id");
    if (requestId) this.requestId = requestId;
    const retryAfter = parseRetryAfter(response.headers?.get("retry-after"));
    if (retryAfter !== undefined) this.retryAfter = retryAfter;
    const data = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    if (typeof data.code === "string") this.code = data.code;
    const details = data.error_details;
    if (details && typeof details === "object" && !Array.isArray(details))
      this.errorDetails = details as Record<string, unknown>;
  }

  /** True when `code` equals the value, or the value is listed in `errorDetails` (for example `razorpay_requires_inr`). */
  hasCode(code: string): boolean {
    if (code === NO_ACTIVE_SUBSCRIPTION && this.code === "subscription_not_found") return true;
    if (this.code === code) return true;
    return Object.values(this.errorDetails ?? {}).some(
      (value) => value === code || (Array.isArray(value) && value.includes(code)),
    );
  }

  /**
   * Positions of the events a `/events/batch` refused with this code, when every event was refused (402, nothing
   * stored). A partial batch is a 200; read it with {@link refusedEventIndexes}.
   */
  refusedEventIndexes(code: string): number[] {
    return refusedEventIndexes(this.errorDetails, code);
  }
}

/** Thrown before any request when a call's own arguments are invalid (for example a bad `trackBatch()` event). */
export class NozleValidationError extends Error {
  /** Position of the offending event in a batch call, when the problem is one event's. */
  readonly index?: number;

  constructor(message: string, index?: number) {
    super(message);
    this.name = "NozleValidationError";
    if (index !== undefined) this.index = index;
  }
}

/** `error_details` of a `/events/batch` answer: field errors keyed by the event's index in the request. */
export type EventBatchErrorDetails = Record<string, Record<string, string[]>>;

/** A `/events/batch` 200: the stored events, and `error_details` for the events refused by index (the others were stored). */
export interface EventBatchResponse<Event = Record<string, unknown>> {
  events: Event[];
  error_details?: EventBatchErrorDetails;
}

/**
 * Positions, ascending, that `error_details` of a `/events/batch` answer lists with this code, for example
 * `[2]` for `{ "2": { external_customer_id: ["customer_payment_overdue"] } }`. Pass a 200 body's `error_details`.
 */
export function refusedEventIndexes(details: unknown, code: string): number[] {
  if (!details || typeof details !== "object") return [];
  return Object.entries(details)
    .filter(([index, fields]) =>
      /^\d+$/.test(index) && !!fields && typeof fields === "object" &&
      Object.values(fields).some((codes) => Array.isArray(codes) && codes.includes(code)))
    .map(([index]) => Number(index));
}

/**
 * True for a `customer_payment_overdue` refusal: a `NozleApiError` with the code, or a provider SDK error from the
 * LLM proxy with `status` 402 and the code in `code` or in the parsed body `error.code` (the Anthropic SDK keeps
 * the body there). Reads codes only.
 */
export function isCustomerPaymentOverdue(error: unknown): boolean {
  if (error instanceof NozleApiError) return error.hasCode(CUSTOMER_PAYMENT_OVERDUE);
  if (!error || typeof error !== "object") return false;
  const { status, code, error: body } = error as { status?: unknown; code?: unknown; error?: { code?: unknown } | null };
  return status === 402 && (code === CUSTOMER_PAYMENT_OVERDUE || (typeof body === "object" && body?.code === CUSTOMER_PAYMENT_OVERDUE));
}

export const CUSTOMER_PAYMENT_OVERDUE = "customer_payment_overdue";

/** The one code for a customer with no active subscription. Core's `subscription_not_found` counts as the same case in {@link NozleApiError.hasCode}. */
export const NO_ACTIVE_SUBSCRIPTION = "active_subscription_not_found";

/** True when the error means the customer has no active subscription, whichever service or SDK path raised it. */
export function isNoActiveSubscription(error: unknown): boolean {
  return error instanceof NozleApiError && error.hasCode(NO_ACTIVE_SUBSCRIPTION);
}

/** The error for a customer with no, or several, active subscriptions, with the code the Engine uses for the same case. */
export function subscriptionError(code: "active_subscription_not_found" | "active_subscription_ambiguous", message: string): NozleApiError {
  const error = new NozleApiError("subscription lookup", { status: 422, statusText: "Unprocessable Entity" }, { code });
  error.message = message;
  return error;
}

/** Builds the error for a non-2xx response, reading `code` and `error_details` from a JSON body when there is one. */
export async function apiError(operation: string, response: Response): Promise<NozleApiError> {
  const body = await Promise.resolve()
    .then(() => response.json())
    .catch(() => undefined);
  return new NozleApiError(operation, response, body);
}

/** `: <text>` from the response body's `error` or `message` string (or the LLM proxy's `error.message`), or an empty string. */
function serverText(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const { error, message } = body as Record<string, unknown>;
  const nested = error && typeof error === "object" ? (error as Record<string, unknown>).message : undefined;
  const text = [error, nested, message].find((value) => typeof value === "string" && value.trim());
  return text ? `: ${(text as string).trim().slice(0, 500)}` : "";
}

/** Seconds from a `Retry-After` value: delta-seconds or an HTTP-date. */
export function parseRetryAfter(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, Math.ceil((date - Date.now()) / 1000));
}
