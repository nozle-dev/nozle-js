import { afterEach, describe, expect, it, vi } from "vitest";
import { Nozle, NozleApiError } from "../index";

const migration = {
  nozle_id: "mig_1", plan_code: "pro", from_version: 1, to_version: 2, status: "running",
  matched_count: 3, succeeded_count: 0, skipped_count: 0, failed_count: 0, created_at: "2026-10-22T10:00:00Z",
};

function capture(respond: (url: string, method: string) => Response = () => Response.json({ plan_version_migration: migration })) {
  const calls: { method: string; url: string; body: unknown }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    calls.push({ method, url: String(input), body: init.body ? JSON.parse(String(init.body)) : undefined });
    return respond(String(input), method);
  }));
  return calls;
}

const nozle = (apiKey = "sk_test") => new Nozle({ apiKey, host: "https://api.example" });
afterEach(() => vi.unstubAllGlobals());

describe("plan versions", () => {
  it("lists the versions of a plan code and reads one version, from Core", async () => {
    const versions = [
      { nozle_id: "p1", version: 1, is_current: false, created_at: "2026-10-01T09:00:00Z", amount_cents: 4900, amount_currency: "USD", active_subscriptions_count: 42 },
      { nozle_id: "p2", version: 2, is_current: true, created_at: "2026-10-15T09:00:00Z", amount_cents: 5900, amount_currency: "USD", active_subscriptions_count: 7 },
    ];
    const calls = capture((url) => Response.json(url.includes("/versions") ? { versions } : { plan: { code: "pro", version: 1, is_current: false } }));
    expect(await nozle().planVersions.list("pro plan")).toEqual(versions);
    expect(await nozle().planVersions.get("pro", 1)).toEqual({ code: "pro", version: 1, is_current: false });
    expect(calls).toEqual([
      { method: "GET", url: "https://api.example/core/api/v1/plans/pro%20plan/versions", body: undefined },
      { method: "GET", url: "https://api.example/core/api/v1/plans/pro?version=1", body: undefined },
    ]);
  });

  it("previews, starts, lists, reads and cancels a version migration", async () => {
    const preview = {
      plan_code: "pro", from_version: 1, to_version: 2,
      items: [{ external_subscription_id: "sub_1", external_customer_id: "cus_1", outcome: "move", skip_reason: null, effective_on: "2026-11-01", current_amount_cents: 4900, new_amount_cents: 5900 }],
    };
    const calls = capture((url, method) => {
      if (url.endsWith("/preview")) return Response.json({ plan_version_migration_preview: preview });
      if (method === "GET" && url.endsWith("/version-migrations")) return Response.json({ plan_version_migrations: [migration] });
      return Response.json({ plan_version_migration: { ...migration, items: [{ external_subscription_id: "sub_1", status: "succeeded", move_status: "pending" }] } });
    });
    const client = nozle();
    expect(await client.planVersions.previewMigration("pro", { fromVersion: 1 })).toEqual(preview);
    expect((await client.planVersions.createMigration("pro", { fromVersion: 1, toVersion: 2 })).nozle_id).toBe("mig_1");
    expect(await client.planVersions.listMigrations("pro")).toEqual([migration]);
    expect((await client.planVersions.getMigration("pro", "mig_1")).items?.[0].move_status).toBe("pending");
    await client.planVersions.cancelMigration("pro", "mig_1");
    const base = "https://api.example/core/api/v1/plans/pro/version-migrations";
    expect(calls).toEqual([
      { method: "POST", url: `${base}/preview`, body: { from_version: 1 } },
      { method: "POST", url: base, body: { from_version: 1, to_version: 2 } },
      { method: "GET", url: base, body: undefined },
      { method: "GET", url: `${base}/mig_1`, body: undefined },
      { method: "POST", url: `${base}/mig_1/cancel`, body: undefined },
    ]);
  });

  it("surfaces a running migration as a 409 error with its code", async () => {
    capture(() => Response.json({ status: 409, error: "Conflict", code: "plan_version_migration_running" }, { status: 409 }));
    const error = await nozle().planVersions.createMigration("pro", { fromVersion: 1 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NozleApiError);
    expect((error as NozleApiError).status).toBe(409);
    expect((error as NozleApiError).code).toBe("plan_version_migration_running");
  });

  it("refuses bad input and publishable keys before any request", async () => {
    const calls = capture();
    await expect(nozle().planVersions.previewMigration("pro", { fromVersion: 0 })).rejects.toThrow("fromVersion");
    await expect(nozle().planVersions.createMigration("pro", { fromVersion: 1, toVersion: 1.5 })).rejects.toThrow("toVersion");
    await expect(nozle().planVersions.get("pro", 0)).rejects.toThrow("version");
    await expect(nozle().planVersions.list(" ")).rejects.toThrow("plan code");
    await expect(nozle().planVersions.cancelMigration("pro", "")).rejects.toThrow("migration id");
    await expect(nozle("pk_browser").planVersions.list("pro")).rejects.toThrow("secret key");
    expect(calls).toEqual([]);
  });
});

describe("subscribe to a plan version", () => {
  it("sends plan_version only when asked", async () => {
    const calls = capture(() => Response.json({ subscription_id: "sub-cust-pro", status: "active" }));
    await nozle().subscribe("cust", "pro");
    await nozle().subscribe("cust", "pro", { planVersion: 1 });
    expect(calls.map((call) => call.body)).toEqual([
      { plan_code: "pro", customer_id: "cust" },
      { plan_code: "pro", customer_id: "cust", plan_version: 1 },
    ]);
    expect(calls[0].url).toBe("https://api.example/engine/api/v1/subscribe");
  });

  it("refuses a version below 1 before any request", async () => {
    const calls = capture();
    await expect(nozle().subscribe("cust", "pro", { planVersion: 0 })).rejects.toThrow("planVersion");
    expect(calls).toEqual([]);
  });
});
