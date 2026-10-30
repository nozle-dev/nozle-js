import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Nozle, WebhookVerificationError, createWebhookHandler } from "../index";

const body = JSON.stringify({
  webhook_type: "subscription.started",
  object_type: "subscription",
  organization_id: "org_1",
  subscription: { external_id: "sub_1", plan_code: "pro" },
});
const nozle = () => new Nozle({ apiKey: "sk_test", host: "https://api.example" });

afterEach(() => vi.unstubAllGlobals());

describe("webhooks.verify", () => {
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

  it("matches the published vector (body is not a Nozle event, so parsing fails after the signature passes)", async () => {
    await expect(verify({ body: vBody, headers: std(vSig) })).rejects.toMatchObject({ code: "invalid_payload" });
    await expect(verify({ body: vBody, headers: std(vSig.replace("g0h", "g0i")) })).rejects.toMatchObject({ code: "invalid_signature" });
  });

  it("accepts a signed Nozle event with no network call", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const ts = String(Math.floor(Date.now() / 1000));
    const event = await verify({ headers: std(sign256(secret, vId, ts, body), ts) });
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
      await expect(verify({ headers: rest })).rejects.toMatchObject({ code: "missing_signature" });
    }
    await expect(verify({ headers: {} })).rejects.toMatchObject({ code: "missing_signature" });
    await expect(verify({ headers: std(good["webhook-signature"], "abc") })).rejects.toMatchObject({ code: "invalid_timestamp" });
    await expect(verify({ headers: good, secret: undefined })).rejects.toMatchObject({ code: "missing_secret" });
  });

  it("createWebhookHandler answers 200 for a genuine delivery and 400 for a bad one", async () => {
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
