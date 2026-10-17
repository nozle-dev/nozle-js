import { createHmac, createPublicKey, timingSafeEqual, verify as verifySignature, type KeyObject } from "node:crypto";
import { apiError } from "./errors";
import { request, type RequestPolicy } from "./http";

/** A verified webhook from Nozle. */
export interface NozleWebhookEvent<T = Record<string, unknown>> {
  /** `X-Nozle-Unique-Key`: the same on every delivery attempt, so use it to skip duplicates. */
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
  | "unsupported_algorithm"
  | "missing_hmac_key"
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
  /** Needed for `hmac` endpoints: the organization's signing secret from Developers > Webhooks. */
  hmacKey?: string;
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

function hmacMatches(body: Buffer, signature: string, key: string): boolean {
  const expected = createHmac("sha256", key).update(body).digest();
  const received = Buffer.from(signature, "base64");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

// An RS256 JWT whose `data` claim is the body.
function jwtMatches(body: Buffer, token: string, key: KeyObject): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  try {
    const head = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as { alg?: string };
    if (head.alg !== "RS256") return false;
    const signed = verifySignature("sha256", Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], "base64url"));
    if (!signed) return false;
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { data?: unknown };
    return typeof claims.data === "string" && Buffer.from(claims.data, "utf8").equals(body);
  } catch {
    return false;
  }
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
  private publicKey?: Promise<KeyObject>;

  constructor(
    private readonly coreUrl: string,
    private readonly apiKey: string,
    private readonly policy: RequestPolicy,
  ) {}

  /**
   * Checks `X-Nozle-Signature` against the raw body and returns the parsed event, or throws
   * `WebhookVerificationError`. `jwt` endpoints need no secret: the public key is read once from
   * Core with your secret key and cached.
   */
  async verify(input: VerifyWebhookInput): Promise<NozleWebhookEvent> {
    const signature = header(input.headers, "x-nozle-signature");
    const algorithm = header(input.headers, "x-nozle-signature-algorithm");
    const id = header(input.headers, "x-nozle-unique-key") ?? "";
    if (!signature || !algorithm) throw new WebhookVerificationError("missing_signature", "X-Nozle-Signature headers are missing");
    const body = bytes(input.body);

    if (algorithm === "hmac") {
      if (!input.hmacKey) throw new WebhookVerificationError("missing_hmac_key", "hmac webhooks need the organization's hmacKey");
      if (!hmacMatches(body, signature, input.hmacKey)) {
        throw new WebhookVerificationError("invalid_signature", "webhook signature does not match");
      }
    } else if (algorithm === "jwt") {
      let valid = jwtMatches(body, signature, await this.key());
      // The key may have been rotated since it was cached: read it again once.
      if (!valid) valid = jwtMatches(body, signature, await this.key(true));
      if (!valid) throw new WebhookVerificationError("invalid_signature", "webhook signature does not match");
    } else {
      throw new WebhookVerificationError("unsupported_algorithm", `unsupported signature algorithm ${algorithm}`);
    }
    return parseEvent(body, id);
  }

  private key(refresh = false): Promise<KeyObject> {
    if (refresh || !this.publicKey) {
      this.publicKey = this.fetchKey();
      this.publicKey.catch(() => (this.publicKey = undefined));
    }
    return this.publicKey;
  }

  private async fetchKey(): Promise<KeyObject> {
    if (!this.apiKey.startsWith("sk_")) throw new Error("verifying jwt webhooks requires a secret key");
    const response = await request(this.policy, `${this.coreUrl}/api/v1/webhooks/json_public_key`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!response.ok) throw await apiError("webhooks.publicKey", response);
    const data = (await response.json()) as { webhook?: { public_key?: string } };
    const pem = Buffer.from(data.webhook?.public_key ?? "", "base64").toString("utf8");
    return createPublicKey(pem);
  }
}

export interface WebhookHandlerOptions {
  /** For `hmac` endpoints. */
  hmacKey?: string;
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
      event = await nozle.webhooks.verify({ body, headers: incoming.headers, hmacKey: options.hmacKey });
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
