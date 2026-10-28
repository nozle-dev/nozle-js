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

const cardRequired = () =>
  new Response(JSON.stringify({ code: "card_required", error: "Add a card to your Nozle workspace to use the API." }), {
    status: 402,
    statusText: "Payment Required",
  });

describe("workspace_suspended and card_required (402)", () => {
  const calls: Array<[string, () => Promise<unknown>]> = [
    ["can", () => client().can("c", "f")],
    ["track", () => client().track("c", "e", {}, { subscriptionId: "s" })],
    ["usage.check", () => client().usage.check({ customerId: "c", featureCode: "f" })],
    ["plans", () => client().plans()],
  ];

  const cases = [["workspace_suspended", suspended], ["card_required", cardRequired]] as const;
  for (const [code, response] of cases) {
    it.each(calls)(`%s throws NozleApiError with ${code}, once`, async (_name, call) => {
      fetchMock.mockResolvedValue(response());
      const error = await call().then(() => undefined, (cause: unknown) => cause);
      expect(error).toBeInstanceOf(NozleApiError);
      expect((error as NozleApiError).status).toBe(402);
      expect((error as NozleApiError).code).toBe(code);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  }

  it("the billing handler passes the code to the browser", async () => {
    const nozle = { can: vi.fn(async () => Promise.reject(new NozleApiError("can check", { status: 402, statusText: "Payment Required" }, { code: "workspace_suspended" }))) };
    const handler = createBillingHandler(nozle as any, { getCustomerId: () => "cust" });
    const res = await handler(new Request("https://app.example/api/nozle/entitlement?feature=f"));
    expect(res.status).toBe(402);
    expect((await res.json()).code).toBe("workspace_suspended");
  });
});
