import { createHmac, timingSafeEqual } from "node:crypto";

/** A verified webhook from Nozle. */
export interface NozleWebhookEvent<T = Record<string, unknown>> {
  /** `webhook-id`: the same on every delivery attempt, so use it to skip duplicates. */
  id: string;
  /** `webhook_type`, for example `subscription.started`. */
  type: string;
  /** `object_type`, for example `subscription`. */
  objectType: string;
  organizationId: string | null;
  /** The object the webhook is about: `payload[objectType]`. */
  object: T;
  /** The whole parsed body. */
  payload: Record<string, unknown>;
}

export type WebhookVerificationCode =
  | "missing_signature"
  | "missing_secret"
  | "invalid_timestamp"
  | "invalid_signature"
  | "invalid_payload";

/** The request is not a genuine Nozle webhook. Answer it with 400 and do not act on it. */
export class WebhookVerificationError extends Error {
  readonly code: WebhookVerificationCode;
  constructor(code: WebhookVerificationCode, message: string) {
    super(message);
    this.name = "WebhookVerificationError";
    this.code = code;
  }
}

export type WebhookHeaders = Headers | Record<string, string | string[] | undefined>;

export interface VerifyWebhookInput {
  /** The raw request body, exactly as received. Parsed and re-serialised JSON fails the check. */
  body: string | Uint8Array;
  headers: WebhookHeaders;
  /** The endpoint's `whsec_` secret. Pass several while a secret is being rotated. */
  secret?: string | string[];
  /** Largest accepted gap, in seconds, between `webhook-timestamp` and now. Default 300. */
  toleranceSeconds?: number;
}

function header(headers: WebhookHeaders, name: string): string | undefined {
  if (typeof (headers as Headers).get === "function") return (headers as Headers).get(name) ?? undefined;
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) return Array.isArray(value) ? value[0] : value;
  }
  return undefined;
}

function bytes(body: string | Uint8Array): Buffer {
  return typeof body === "string" ? Buffer.from(body, "utf8") : Buffer.from(body);
}

// Standard Webhooks: HMAC-SHA256 over `id.timestamp.body`, keyed by the base64 part of the `whsec_` secret.
// `signatures` is the space-separated `webhook-signature` list; entries of other versions are ignored.
function standardMatches(body: Buffer, id: string, timestamp: string, signatures: string, secrets: string[]): boolean {
  const received: Buffer[] = [];
  for (const entry of signatures.split(" ")) {
    const comma = entry.indexOf(",");
    if (comma > 0 && entry.slice(0, comma) === "v1") received.push(Buffer.from(entry.slice(comma + 1), "base64"));
  }
  let ok = false;
  for (const secret of secrets) {
    const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
    const expected = createHmac("sha256", key).update(`${id}.${timestamp}.`).update(body).digest();
    // No early exit: every candidate is compared.
    for (const candidate of received) {
      if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) ok = true;
    }
  }
  return ok;
}

function parseEvent(body: Buffer, id: string): NozleWebhookEvent {
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body.toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new WebhookVerificationError("invalid_payload", "webhook body is not JSON");
  }
  if (!payload || typeof payload !== "object" || typeof payload.webhook_type !== "string") {
    throw new WebhookVerificationError("invalid_payload", "webhook body has no webhook_type");
  }
  const objectType = typeof payload.object_type === "string" ? payload.object_type : "";
  return {
    id,
    type: payload.webhook_type,
    objectType,
    organizationId: typeof payload.organization_id === "string" ? payload.organization_id : null,
    object: (objectType ? payload[objectType] : undefined) as Record<string, unknown>,
    payload,
  };
}

export class WebhooksNamespace {
  /**
   * Checks `webhook-id`, `webhook-timestamp` and `webhook-signature` against the raw body and
   * returns the parsed event, or throws `WebhookVerificationError`. Local only: no network call.
   */
  async verify(input: VerifyWebhookInput): Promise<NozleWebhookEvent> {
    const id = header(input.headers, "webhook-id");
    const timestamp = header(input.headers, "webhook-timestamp");
    const signatures = header(input.headers, "webhook-signature");
    if (!id || !timestamp || !signatures) {
      throw new WebhookVerificationError("missing_signature", "webhook-id, webhook-timestamp or webhook-signature header is missing");
    }
    const secrets = ([] as string[]).concat(input.secret ?? []).filter(Boolean);
    if (!secrets.length) throw new WebhookVerificationError("missing_secret", "webhooks need the endpoint's whsec_ secret");
    const seconds = Number(timestamp);
    if (!timestamp.trim() || !Number.isFinite(seconds)) throw new WebhookVerificationError("invalid_timestamp", "webhook-timestamp is not a Unix timestamp");
    const tolerance = input.toleranceSeconds ?? 300;
    if (Math.abs(Date.now() / 1000 - seconds) > tolerance) {
      throw new WebhookVerificationError("invalid_timestamp", "webhook-timestamp is outside the tolerance");
    }
    const body = bytes(input.body);
    if (!standardMatches(body, id, timestamp, signatures, secrets)) {
      throw new WebhookVerificationError("invalid_signature", "webhook signature does not match");
    }
    return parseEvent(body, id);
  }
}

export interface WebhookHandlerOptions {
  /** The endpoint's `whsec_` secret, or several during rotation. */
  secret?: string | string[];
  /** Timestamp tolerance in seconds. Default 300. */
  toleranceSeconds?: number;
  /** Called once per verified delivery. Throw to answer 500, so Nozle tries again. */
  onEvent: (event: NozleWebhookEvent) => void | Promise<void>;
}

/**
 * A Fetch API handler (Next.js route handlers, Remix, Hono, Bun, Deno) for Nozle webhooks: verifies
 * the signature, calls `onEvent`, and answers 200, 400 for a request that is not genuine, or 500
 * when `onEvent` throws.
 */
export function createWebhookHandler(
  nozle: { webhooks: WebhooksNamespace },
  options: WebhookHandlerOptions,
): (request: Request) => Promise<Response> {
  return async (incoming) => {
    if (incoming.method !== "POST") return Response.json({ code: "method_not_allowed" }, { status: 405 });
    let event: NozleWebhookEvent;
    try {
      const body = new Uint8Array(await incoming.arrayBuffer());
      event = await nozle.webhooks.verify({ body, headers: incoming.headers, secret: options.secret, toleranceSeconds: options.toleranceSeconds });
    } catch (error) {
      if (error instanceof WebhookVerificationError) return Response.json({ code: error.code }, { status: 400 });
      throw error;
    }
    try {
      await options.onEvent(event);
    } catch {
      return Response.json({ code: "handler_failed" }, { status: 500 });
    }
    return Response.json({ received: true });
  };
}
