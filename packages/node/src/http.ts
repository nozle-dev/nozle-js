export interface RequestPolicy {
  /** Per-attempt timeout in milliseconds. */
  timeout: number;
  /** Extra attempts after a failure. 0 (the default) never retries. */
  maxRetries: number;
  /** First retry delay in milliseconds; it doubles each retry, up to 10 seconds. */
  retryDelayMs: number;
}

const MAX_DELAY_MS = 10_000;
const MAX_RETRY_AFTER_MS = 30_000;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function delayFor(policy: RequestPolicy, attempt: number, response?: Response): number {
  const retryAfter = response?.headers?.get("retry-after");
  const seconds = retryAfter ? Number(retryAfter) : Number.NaN;
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  const base = Math.min(policy.retryDelayMs * 2 ** attempt, MAX_DELAY_MS);
  return base * (0.5 + Math.random() * 0.5);
}

/**
 * fetch with a per-attempt timeout and opt-in retries. A request is retried only when it is safe to
 * repeat: a GET or HEAD, a call that carries an `Idempotency-Key`, or a call the caller marks
 * `idempotent`. Network errors, timeouts, 429 and 5xx are retried, honouring `Retry-After`.
 */
export async function request(
  policy: RequestPolicy,
  url: string | URL,
  init: RequestInit = {},
  options: { idempotent?: boolean } = {},
): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const safe =
    method === "GET" ||
    method === "HEAD" ||
    options.idempotent === true ||
    new Headers(init.headers).has("idempotency-key");
  const retries = safe ? policy.maxRetries : 0;

  for (let attempt = 0; ; attempt += 1) {
    let response: Response | undefined;
    let failure: unknown;
    try {
      response = await fetch(url, { ...init, signal: AbortSignal.timeout(policy.timeout) });
    } catch (error) {
      failure = error;
    }
    const retryable = response === undefined || response.status === 429 || response.status >= 500;
    if (!retryable) return response as Response;
    if (attempt >= retries) {
      if (response) return response;
      throw failure;
    }
    await wait(delayFor(policy, attempt, response));
    await response?.body?.cancel?.().catch(() => undefined);
  }
}
