import { afterEach, describe, expect, it, vi } from "vitest";
import { Nozle } from "../client";
import { createBillingHandler } from "../billing-handler";
import { NozleApiError } from "../errors";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
afterEach(() => fetchMock.mockReset());

const suspended = () =>
  new Response(
    JSON.stringify({ code: "workspace_suspended", error: "This workspace is suspended because its Nozle invoices are unpaid. Pay them to resume." }),
    { status: 402, statusText: "Payment Required" },
  );
// Retries on and a fast delay: a 402 must still be sent once.
const client = () => new Nozle({ apiKey: "sk_test", maxRetries: 3, retryDelayMs: 1 });

describe("workspace_suspended (402)", () => {
  const calls: Array<[string, () => Promise<unknown>]> = [
    ["can", () => client().can("c", "f")],
    ["track", () => client().track("c", "e", {}, { subscriptionId: "s" })],
    ["usage.check", () => client().usage.check({ customerId: "c", featureCode: "f" })],
    ["plans", () => client().plans()],
  ];

  it.each(calls)("%s throws NozleApiError with the code, once", async (_name, call) => {
    fetchMock.mockResolvedValue(suspended());
    const error = await call().then(() => undefined, (cause: unknown) => cause);
    expect(error).toBeInstanceOf(NozleApiError);
    expect((error as NozleApiError).status).toBe(402);
    expect((error as NozleApiError).code).toBe("workspace_suspended");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("the billing handler passes the code to the browser", async () => {
    const nozle = { can: vi.fn(async () => Promise.reject(new NozleApiError("can check", { status: 402, statusText: "Payment Required" }, { code: "workspace_suspended" }))) };
    const handler = createBillingHandler(nozle as any, { getCustomerId: () => "cust" });
    const res = await handler(new Request("https://app.example/api/nozle/entitlement?feature=f"));
    expect(res.status).toBe(402);
    expect((await res.json()).code).toBe("workspace_suspended");
  });
});
