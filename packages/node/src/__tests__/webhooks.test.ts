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
