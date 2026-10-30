import { createHmac, generateKeyPairSync, sign } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Nozle, WebhookVerificationError, createWebhookHandler } from "../index";

const body = JSON.stringify({
  webhook_type: "subscription.started",
  object_type: "subscription",
  organization_id: "org_1",
  subscription: { external_id: "sub_1", plan_code: "pro" },
});
const hmacKey = "org-hmac-key";
const hmacSignature = createHmac("sha256", hmacKey).update(body).digest("base64");

function keyPair() {
  return generateKeyPairSync("rsa", { modulusLength: 2048 });
}
const first = keyPair();

function jwt(data: string, privateKey = first.privateKey, alg = "RS256") {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const signed = `${part({ alg, typ: "JWT" })}.${part({ data, iss: "https://api.nozle.app" })}`;
  return `${signed}.${sign("sha256", Buffer.from(signed), privateKey).toString("base64url")}`;
}

function servePublicKey(...keys: ReturnType<typeof keyPair>[]) {
  let call = 0;
  const fetch = vi.fn(async () => {
    const key = keys[Math.min(call++, keys.length - 1)].publicKey.export({ type: "spki", format: "pem" });
    return Response.json({ webhook: { public_key: Buffer.from(key).toString("base64") } });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const nozle = () => new Nozle({ apiKey: "sk_test", host: "https://api.example" });
const headers = (signature: string, algorithm: string) => ({
  "X-Nozle-Signature": signature,
  "X-Nozle-Signature-Algorithm": algorithm,
  "X-Nozle-Unique-Key": "wh_1",
});

afterEach(() => vi.unstubAllGlobals());

describe("webhooks.verify", () => {
  it("accepts an hmac signature and returns the event", async () => {
    const event = await nozle().webhooks.verify({ body, headers: headers(hmacSignature, "hmac"), hmacKey });
    expect(event).toMatchObject({
      id: "wh_1",
      type: "subscription.started",
      objectType: "subscription",
      organizationId: "org_1",
      object: { external_id: "sub_1", plan_code: "pro" },
    });
  });

  it("rejects a changed body, a wrong key and a missing key", async () => {
    const client = nozle();
    await expect(client.webhooks.verify({ body: body.replace("pro", "max"), headers: headers(hmacSignature, "hmac"), hmacKey }))
      .rejects.toMatchObject({ code: "invalid_signature" });
    await expect(client.webhooks.verify({ body, headers: headers(hmacSignature, "hmac"), hmacKey: "other" }))
      .rejects.toMatchObject({ code: "invalid_signature" });
    await expect(client.webhooks.verify({ body, headers: headers(hmacSignature, "hmac") }))
      .rejects.toMatchObject({ code: "missing_hmac_key" });
  });

  it("rejects missing headers and unknown algorithms", async () => {
    await expect(nozle().webhooks.verify({ body, headers: {} })).rejects.toBeInstanceOf(WebhookVerificationError);
    await expect(nozle().webhooks.verify({ body, headers: headers("x", "md5") })).rejects.toMatchObject({ code: "unsupported_algorithm" });
  });

  it("accepts a jwt signed by Nozle's key, read once from Core with the secret key", async () => {
    const fetch = servePublicKey(first);
    const client = nozle();
    await client.webhooks.verify({ body, headers: headers(jwt(body), "jwt") });
    await client.webhooks.verify({ body, headers: new Headers(headers(jwt(body), "jwt")) });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example/core/api/v1/webhooks/json_public_key");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer sk_test");
  });

  it("rejects a jwt for another body, another key or another algorithm", async () => {
    servePublicKey(first);
    const client = nozle();
    await expect(client.webhooks.verify({ body, headers: headers(jwt(`${body} `), "jwt") })).rejects.toMatchObject({ code: "invalid_signature" });
    await expect(client.webhooks.verify({ body, headers: headers(jwt(body, keyPair().privateKey), "jwt") })).rejects.toMatchObject({ code: "invalid_signature" });
    await expect(client.webhooks.verify({ body, headers: headers(jwt(body, first.privateKey, "HS256"), "jwt") })).rejects.toMatchObject({ code: "invalid_signature" });
  });

  it("reads the key again once when Nozle rotated it", async () => {
    const second = keyPair();
    const fetch = servePublicKey(first, second);
    const client = nozle();
    await client.webhooks.verify({ body, headers: headers(jwt(body), "jwt") });
    await client.webhooks.verify({ body, headers: headers(jwt(body, second.privateKey), "jwt") });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("createWebhookHandler", () => {
  const post = (signature: string) =>
    new Request("https://app.example/nozle/webhooks", { method: "POST", body, headers: headers(signature, "hmac") });

  it("calls onEvent and answers 200 for a genuine delivery", async () => {
    const onEvent = vi.fn();
    const response = await createWebhookHandler(nozle(), { hmacKey, onEvent })(post(hmacSignature));
    expect(response.status).toBe(200);
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ id: "wh_1", type: "subscription.started" }));
  });

  it("answers 400 without calling onEvent when the signature is wrong", async () => {
    const onEvent = vi.fn();
    const response = await createWebhookHandler(nozle(), { hmacKey, onEvent })(post("bad"));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: "invalid_signature" });
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("answers 500 when onEvent throws, so Nozle retries", async () => {
    const response = await createWebhookHandler(nozle(), { hmacKey, onEvent: () => { throw new Error("db down"); } })(post(hmacSignature));
    expect(response.status).toBe(500);
  });
});

describe("webhooks.verify standard", () => {
  const secret = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
  const vId = "msg_p5jXN8AQM9LWM0D4loKWxJek";
  const vTs = "1614265330";
  const vBody = '{"test": 2432232314}';
  const vSig = "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=";
  const std = (signature: string, ts = vTs, extra: Record<string, string> = {}) => ({
    "webhook-id": vId,
    "webhook-timestamp": ts,
    "webhook-signature": signature,
    ...extra,
  });
  const sign256 = (key: string, id: string, ts: string, text: string) =>
    "v1," + createHmac("sha256", Buffer.from(key.slice(6), "base64")).update(`${id}.${ts}.${text}`).digest("base64");
  const verify = (input: Partial<Parameters<ReturnType<typeof nozle>["webhooks"]["verify"]>[0]>) =>
    nozle().webhooks.verify({ body: body, headers: {}, secret, toleranceSeconds: 1e12, ...input });

  afterEach(() => vi.useRealTimers());

  it("matches the published vector (body is not a Nozle event, so parse fails after the signature passes)", async () => {
    await expect(verify({ body: vBody, headers: std(vSig) })).rejects.toMatchObject({ code: "invalid_payload" });
    await expect(verify({ body: vBody, headers: std(vSig.replace("g0h", "g0i")) })).rejects.toMatchObject({ code: "invalid_signature" });
  });

  it("accepts a signed Nozle event with no network call", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const ts = String(Math.floor(Date.now() / 1000));
    const event = await verify({ headers: std(sign256(secret, vId, ts, body), ts, { "x-nozle-signature-algorithm": "standard" }) });
    expect(event).toMatchObject({ id: vId, type: "subscription.started" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret and a tampered body", async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const headers = std(sign256(secret, vId, ts, body), ts);
    await expect(verify({ headers, secret: "whsec_" + Buffer.from("another secret").toString("base64") })).rejects.toMatchObject({ code: "invalid_signature" });
    await expect(verify({ headers, body: body.replace("pro", "max") })).rejects.toMatchObject({ code: "invalid_signature" });
  });

  it("enforces the 300 s tolerance: 301 s fails, 299 s passes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1700000000_000));
    const at = (age: number) => {
      const ts = String(1700000000 - age);
      return std(sign256(secret, vId, ts, body), ts);
    };
    const strict = { toleranceSeconds: undefined };
    await expect(verify({ headers: at(301), ...strict })).rejects.toMatchObject({ code: "invalid_timestamp" });
    await expect(verify({ headers: at(299), ...strict })).resolves.toMatchObject({ id: vId });
  });

  it("accepts when only the second signature matches, and any configured secret", async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const old = "whsec_" + Buffer.from("previous secret").toString("base64");
    const good = sign256(secret, vId, ts, body);
    await expect(verify({ headers: std(`v1,AAAA ${good}`, ts) })).resolves.toMatchObject({ id: vId });
    await expect(verify({ headers: std(sign256(old, vId, ts, body), ts), secret: [secret, old] })).resolves.toMatchObject({ id: vId });
  });

  it("ignores v2 entries", async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const good = sign256(secret, vId, ts, body).replace("v1,", "v2,");
    await expect(verify({ headers: std(good, ts) })).rejects.toMatchObject({ code: "invalid_signature" });
  });

  it("fails on missing or bad headers and missing secret", async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const good = std(sign256(secret, vId, ts, body), ts);
    for (const name of ["webhook-id", "webhook-timestamp"]) {
      const { [name]: _gone, ...rest } = good;
      await expect(verify({ headers: { ...rest, "x-nozle-signature-algorithm": "standard" } })).rejects.toMatchObject({ code: "missing_signature" });
    }
    await expect(verify({ headers: { "x-nozle-signature-algorithm": "standard" } })).rejects.toMatchObject({ code: "missing_signature" });
    await expect(verify({ headers: std(good["webhook-signature"], "abc") })).rejects.toMatchObject({ code: "invalid_timestamp" });
    await expect(verify({ headers: good, secret: undefined })).rejects.toMatchObject({ code: "missing_secret" });
  });

  it("createWebhookHandler verifies standard deliveries", async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const onEvent = vi.fn();
    const handler = createWebhookHandler(nozle(), { secret, onEvent });
    const post = (signature: string) =>
      handler(new Request("https://x.example/hook", { method: "POST", body, headers: std(signature, ts) }));
    expect((await post(sign256(secret, vId, ts, body))).status).toBe(200);
    expect(onEvent).toHaveBeenCalledOnce();
    expect((await post("v1,AAAA")).status).toBe(400);
  });
});
