/**
 * Error thrown when a checkout call returns a non-2xx response. The message keeps the
 * `<operation> failed: <status> <statusText>` form; `code` and `errorDetails` carry what Nozle returned.
 */
export class NozleApiError extends Error {
  readonly status: number;
  /** Top-level `code`, for example `payment_provider_required` or `validation_errors`. */
  readonly code?: string;
  /** Raw `error_details` object of a `validation_errors` response, for example `{ base: ["razorpay_requires_inr"] }`. */
  readonly errorDetails?: Record<string, unknown>;

  constructor(operation: string, response: { status: number; statusText: string }, body?: unknown) {
    super(`${operation} failed: ${response.status} ${response.statusText}`);
    this.name = "NozleApiError";
    this.status = response.status;
    const data = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    if (typeof data.code === "string") this.code = data.code;
    const details = data.error_details;
    if (details && typeof details === "object" && !Array.isArray(details))
      this.errorDetails = details as Record<string, unknown>;
  }

  /** True when `code` equals the value, or the value is listed in `errorDetails` (for example `razorpay_requires_inr`). */
  hasCode(code: string): boolean {
    if (this.code === code) return true;
    return Object.values(this.errorDetails ?? {}).some(
      (value) => value === code || (Array.isArray(value) && value.includes(code)),
    );
  }
}
