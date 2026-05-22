import { describe, it, expect, vi } from "vitest";
import { BillingStore } from "../store";

describe("BillingStore", () => {
  it("returns initial state with null entitlements and credits", () => {
    const store = new BillingStore();
    const snapshot = store.getSnapshot();

    expect(snapshot.entitlements).toBeNull();
    expect(snapshot.credits).toBeNull();
    expect(snapshot.usage).toEqual({});
    expect(snapshot.connectionState).toBe("connecting");
    expect(snapshot.error).toBeNull();
  });

  it("subscribe/emit triggers listeners", () => {
    const store = new BillingStore();
    const listener = vi.fn();

    const unsubscribe = store.subscribe(listener);
    store.setConnectionState("connected");

    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    store.setConnectionState("disconnected");

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("setConnectionState updates state", () => {
    const store = new BillingStore();
    store.setConnectionState("connected");

    expect(store.getSnapshot().connectionState).toBe("connected");
  });

  it("setError updates state", () => {
    const store = new BillingStore();
    const err = new Error("test error");
    store.setError(err);

    expect(store.getSnapshot().error).toBe(err);
  });

  it("fetchInitialState populates entitlements, credits, and usage", async () => {
    const store = new BillingStore();
    const mockClient = {
      request: vi.fn().mockImplementation((method: string, path: string) => {
        if (path === "/v1/entitlements") {
          return Promise.resolve({
            plan_slug: "pro",
            subscription_status: "active",
            features: { ai_copilot: { enabled: true, source: "plan" } },
            limits: {
              api_calls: { limit: 10000, used: 2500, source: "plan" },
            },
            credits: 500,
          });
        }
        if (path === "/v1/credits/balance") {
          return Promise.resolve({
            balance: 500,
            currency: "USD",
          });
        }
        return Promise.reject(new Error("Unknown path"));
      }),
    };

    await store.fetchInitialState(mockClient as any, "cust_123");

    const snapshot = store.getSnapshot();
    expect(snapshot.entitlements).toBeDefined();
    expect(snapshot.entitlements!.plan_slug).toBe("pro");
    expect(snapshot.credits).toBeDefined();
    expect(snapshot.credits!.balance).toBe(500);
    expect(snapshot.usage.api_calls).toEqual({
      used: 2500,
      limit: 10000,
      remaining: 7500,
    });
    expect(snapshot.error).toBeNull();
  });

  it("fetchInitialState sets error on failure", async () => {
    const store = new BillingStore();
    const mockClient = {
      request: vi.fn().mockRejectedValue(new Error("Network error")),
    };

    await store.fetchInitialState(mockClient as any, "cust_123");

    const snapshot = store.getSnapshot();
    expect(snapshot.error).toBeInstanceOf(Error);
    expect(snapshot.error!.message).toBe("Network error");
  });

  it("handleEvent triggers refetch for known event types", async () => {
    const store = new BillingStore();
    const mockClient = {
      request: vi.fn().mockResolvedValue({
        plan_slug: "pro",
        subscription_status: "active",
        features: {},
        limits: {},
        credits: 0,
      }),
    };

    store.handleEvent(
      { type: "entitlement.changed" },
      mockClient as any,
      "cust_123"
    );

    // Wait for the async refetch
    await new Promise((r) => setTimeout(r, 10));

    expect(mockClient.request).toHaveBeenCalled();
  });

  it("handleEvent ignores unknown event types", () => {
    const store = new BillingStore();
    const mockClient = {
      request: vi.fn(),
    };

    store.handleEvent(
      { type: "unknown.event" },
      mockClient as any,
      "cust_123"
    );

    expect(mockClient.request).not.toHaveBeenCalled();
  });

  it("getServerSnapshot returns same as getSnapshot", () => {
    const store = new BillingStore();
    expect(store.getServerSnapshot()).toBe(store.getSnapshot());
  });
});
