import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Nozle } from "@nozle-js/node";
import { createPlanService, PlanError } from "./plan-changes.mjs";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Single-process demonstration. Use a transactional shared store in a multi-worker app.
export class ActionStore {
  constructor(path) {
    this.path = path;
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    try {
      this.entries = JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      this.entries = {};
    }
    this.locks = new Map();
  }
  save(key, entry) {
    this.entries[key] = entry;
    writeFileSync(`${this.path}.tmp`, JSON.stringify(this.entries), {
      mode: 0o600,
    });
    renameSync(`${this.path}.tmp`, this.path);
  }
  async exclusive(key, fn) {
    const previous = this.locks.get(key) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(fn);
    this.locks.set(key, next);
    try {
      return await next;
    } finally {
      if (this.locks.get(key) === next) this.locks.delete(key);
    }
  }
}

function fields(body, allowed) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => !allowed.includes(key))
  ) {
    throw new HttpError(400, "Invalid request fields.");
  }
}
function identifier(value) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    Buffer.byteLength(value) > 255
  ) {
    throw new HttpError(400, "Invalid identifier.");
  }
  return value;
}
function date(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d\d-\d\dT.+(?:Z|[+-]\d\d:\d\d)$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new HttpError(400, "Invalid effective date.");
  return value; // Preserve the backend's microsecond precision for its atomic guard.
}
function transition(customerId, body) {
  if (!["cancel", "uncancel"].includes(body.operation))
    throw new HttpError(400, "Unsupported operation.");
  return {
    customerId,
    subscriptionId: identifier(body.subscriptionId),
    operation: body.operation,
    ...(body.operation === "cancel" ? { timing: "end_of_period" } : {}),
  };
}
function quote(value) {
  return {
    operation: value.operation,
    effectiveAt: date(value.effective_at),
    renewalAt: value.renewal_at ? date(value.renewal_at) : null,
  };
}

export function createBillingService({
  sdk,
  store,
  createPortalSession,
  returnOrigin = "http://localhost:4242",
  stripePublishableKey,
}) {
  const plans = createPlanService({
    sdk,
    store,
    returnOrigin,
    stripePublishableKey,
  });
  return async function dispatch(customerId, path, body) {
    if (path.startsWith("/api/billing/plans/"))
      return plans(customerId, path, body);
    if (path === "/api/billing/session") {
      fields(body, []);
      return createPortalSession(customerId);
    }
    if (path === "/api/billing/cancellation/preview") {
      fields(body, ["subscriptionId", "operation"]);
      return quote(
        (await sdk.previewSubscriptionTransition(transition(customerId, body)))
          .subscription_transition,
      );
    }
    if (path !== "/api/billing/cancellation")
      throw new HttpError(404, "Not found.");
    fields(body, [
      "subscriptionId",
      "operation",
      "idempotencyKey",
      "expectedEffectiveAt",
    ]);
    const params = transition(customerId, body);
    const clientKey = identifier(body.idempotencyKey);
    const expected =
      body.operation === "cancel" ? date(body.expectedEffectiveAt) : null;
    if (
      body.operation === "uncancel" &&
      body.expectedEffectiveAt !== undefined
    ) {
      throw new HttpError(400, "Keep does not accept settlement options.");
    }
    // Hash the authenticated identity into the upstream key, preventing cross-customer reuse.
    const key = createHash("sha256")
      .update(JSON.stringify([customerId, clientKey]))
      .digest("hex");
    const fingerprint = JSON.stringify([params, expected]);
    return store.exclusive(key, async () => {
      const entry = store.entries[key];
      if (entry && entry.fingerprint !== fingerprint)
        throw new HttpError(409, "Idempotency key already used.");
      if (entry?.complete) return {};
      if (!entry) {
        const current = (await sdk.previewSubscriptionTransition(params))
          .subscription_transition;
        if (expected && date(current.effective_at) !== expected) {
          throw new HttpError(
            409,
            "Cancellation date changed. Preview and confirm again.",
          );
        }
        // Persist before sending: retries after a lost response must reach Core with the same key.
        store.save(key, { fingerprint, complete: false });
      }
      try {
        await sdk.applySubscriptionTransition(
          { ...params, ...(expected ? { expectedEffectiveAt: expected } : {}) },
          key,
        );
      } catch (error) {
        if (
          /^applySubscriptionTransition failed: 409(?: |$)/.test(error.message)
        ) {
          throw new HttpError(
            409,
            "Subscription changed. Preview and confirm again.",
          );
        }
        throw error;
      }
      store.save(key, { fingerprint, complete: true });
      return {};
    });
  };
}

export function portalSessionReader({
  apiKey,
  coreUrl,
  portalApiUrl = coreUrl,
  fetcher = fetch,
}) {
  return async (customerId) => {
    const response = await fetcher(
      `${coreUrl.replace(/\/$/, "")}/api/v1/customers/${encodeURIComponent(customerId)}/portal_url`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10_000),
        redirect: "error",
      },
    );
    if (!response.ok) throw new Error("Session unavailable");
    const result = await response.json();
    const url = new URL(result.customer?.portal_url);
    const match = url.pathname.match(/\/customer-portal\/([^/]+)\/?$/);
    if (!match) throw new Error("Session unavailable");
    return { token: decodeURIComponent(match[1]), apiUrl: portalApiUrl };
  };
}

const loginPage = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Merchant billing login</title>
<h1>Merchant billing demo</h1><p>Sign in using the demo login token chosen by the server operator.</p>
<form><label>Login token <input type="password" autocomplete="off" required></label><button>Sign in</button></form>
<p role="status"></p><script>document.querySelector('form').onsubmit=async(e)=>{e.preventDefault();
const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:document.querySelector('input').value})});
document.querySelector('input').value='';document.querySelector('[role=status]').textContent=r.ok?'Signed in. Open the React portal on this origin.':'Sign in failed.';};</script></html>`;

export function createMerchantServer({
  origin,
  loginToken,
  customerId,
  dispatch,
  now = Date.now,
}) {
  if (loginToken.length < 32)
    throw new Error("DEMO_LOGIN_TOKEN must contain at least 32 characters");
  const sessions = new Map();
  const digest = (value) => createHash("sha256").update(value).digest();
  return createServer(async (request, response) => {
    const send = (status, body) => {
      response.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(JSON.stringify(body));
    };
    try {
      if (request.method === "GET" && request.url === "/") {
        response.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        });
        response.end(loginPage);
        return;
      }
      if (request.method !== "POST") throw new HttpError(405, "Use POST.");
      if (request.headers.origin !== origin)
        throw new HttpError(403, "Origin not allowed.");
      if (request.headers["content-type"]?.split(";")[0] !== "application/json")
        throw new HttpError(415, "Use JSON.");
      let raw = "";
      for await (const chunk of request) {
        raw += chunk;
        if (Buffer.byteLength(raw) > 32768)
          throw new HttpError(413, "Request too large.");
      }
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        throw new HttpError(400, "Invalid JSON.");
      }
      if (request.url === "/api/login") {
        fields(body, ["token"]);
        if (
          typeof body.token !== "string" ||
          !timingSafeEqual(digest(body.token), digest(loginToken))
        ) {
          throw new HttpError(401, "Sign in failed.");
        }
        for (const [id, session] of sessions)
          if (session.expires <= now()) sessions.delete(id);
        const id = randomBytes(32).toString("hex");
        sessions.set(id, { customerId, expires: now() + 3_600_000 });
        response.setHeader(
          "Set-Cookie",
          `billing_session=${id}; HttpOnly; SameSite=Strict; Secure; Path=/; Max-Age=3600`,
        );
        send(200, {});
        return;
      }
      // Replace this lookup with your app's authentication; never read customerId from JSON.
      const cookie = request.headers.cookie?.match(
        /(?:^|;\s*)billing_session=([a-f0-9]{64})(?:;|$)/,
      )?.[1];
      const session = sessions.get(cookie);
      if (!session || session.expires <= now())
        throw new HttpError(401, "Sign in again.");
      send(200, await dispatch(session.customerId, request.url, body));
    } catch (error) {
      // SDK/upstream errors can include private details. Never echo them to the browser or logs.
      send(
        error instanceof HttpError || error instanceof PlanError
          ? error.status
          : 502,
        {
          error:
            error instanceof HttpError || error instanceof PlanError
              ? error.message
              : "Billing request failed. Refresh before retrying.",
        },
      );
    }
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const required = (key) => {
    if (!process.env[key]) throw new Error(`Set ${key}`);
    return process.env[key];
  };
  const apiKey = required("NOZLE_API_KEY");
  const coreUrl = required("NOZLE_CORE_URL");
  const sdk = new Nozle({
    apiKey,
    baseUrl: required("NOZLE_ENGINE_URL"),
    eventsUrl: coreUrl,
  });
  const origin = process.env.MERCHANT_ORIGIN ?? "http://localhost:4242";
  const dispatch = createBillingService({
    sdk,
    returnOrigin: origin,
    stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    store: new ActionStore(
      process.env.ACTION_STORE_PATH ?? ".billing-portal/actions.json",
    ),
    createPortalSession: portalSessionReader({
      apiKey: process.env.NOZLE_CORE_API_KEY || apiKey,
      coreUrl,
      portalApiUrl: process.env.NOZLE_PORTAL_API_URL || coreUrl,
    }),
  });
  createMerchantServer({
    origin,
    loginToken: required("DEMO_LOGIN_TOKEN"),
    customerId: required("DEMO_CUSTOMER_ID"),
    dispatch,
  }).listen(
    Number(process.env.PORT ?? 4242),
    process.env.HOST ?? "127.0.0.1",
    () => console.log("Merchant billing example ready"),
  );
}
