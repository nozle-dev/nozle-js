import { afterEach, describe, expect, it, vi } from "vitest";

import { BillingStore } from "../store";

const baseUrl = "https://api.example.test";
const publishableKey = "pk_test";
const customerSessionToken = "csess_customer";
const customerId = "cust_123";

function createStore() {
  return new BillingStore(
    baseUrl,
    publishableKey,
    customerSessionToken,
    customerId,
  );
}

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BillingStore", () => {
  it("returns its initial state", () => {
    const snapshot = createStore().getSnapshot();
    expect(snapshot.entitlements).toBeNull();
    expect(snapshot.credits).toBeNull();
    expect(snapshot.usage).toEqual({});
    expect(snapshot.connectionState).toBe("connecting");
    expect(snapshot.error).toBeNull();
  });

  it("notifies subscribers when state changes", () => {
    const store = createStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.setConnectionState("connected");
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    store.setConnectionState("disconnected");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("fetches usage with the tenant customer id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ allowed: true, used: 2, limit: 10, remaining: 8 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const store = createStore();

    await store.fetchUsage("agent_execution");

    expect(fetchMock).toHaveBeenCalledWith(
      `${baseUrl}/api/v1/can?customer_id=${customerId}&feature=agent_execution`,
      { headers: { Authorization: `Bearer ${customerSessionToken}` } },
    );
    expect(store.getSnapshot().usage.agent_execution).toEqual({
      used: 2,
      limit: 10,
      remaining: 8,
    });
  });

  it("records usage-fetch errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
    const store = createStore();

    await store.fetchUsage("voice_call");

    expect(store.getSnapshot().error?.message).toBe("Network error");
  });

  it("creates checkout using canonical request fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ client_secret: "cs_123", invoice_id: "inv_1" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const store = createStore();

    await store.fetchCheckoutSecret("pro", "https://app.test/complete");

    expect(fetchMock).toHaveBeenCalledWith(
      `${baseUrl}/api/v1/checkout`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          plan_code: "pro",
          customer_id: customerId,
          success_url: "https://app.test/complete",
        }),
      }),
    );
  });

  it("fetches plans through the authenticated organization", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        plans: [
          {
            code: "pro",
            name: "Pro",
            amount_cents: 1499,
            amount_currency: "USD",
            interval: "monthly",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const plans = await createStore().fetchPlans();
    expect(plans).toHaveLength(1);
    expect(plans[0]?.code).toBe("pro");
    expect(fetchMock).toHaveBeenCalledWith(`${baseUrl}/api/v1/plans`, {
      headers: { Authorization: `Bearer ${publishableKey}` },
    });
  });

  it("rejects publishable or secret credentials in the customer-session slot", () => {
    expect(
      () => new BillingStore(baseUrl, publishableKey, publishableKey, customerId),
    ).toThrow("customerSessionToken must start with csess_");
    expect(
      () => new BillingStore(baseUrl, publishableKey, "sk_server", customerId),
    ).toThrow("customerSessionToken must start with csess_");
  });

  it("applies real-time usage updates", () => {
    const store = createStore();
    store.handleEvent({
      type: "usage.updated",
      metric: "chat",
      used: 4,
      limit: 50,
      remaining: 46,
    });
    expect(store.getSnapshot().usage.chat).toEqual({
      used: 4,
      limit: 50,
      remaining: 46,
    });
  });

  it("ignores unknown real-time events", () => {
    const store = createStore();
    store.handleEvent({ type: "unknown.event" });
    expect(store.getSnapshot().usage).toEqual({});
  });
});
