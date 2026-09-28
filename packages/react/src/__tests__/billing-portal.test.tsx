import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BillingPortal } from "../components/portal/BillingPortal.js";
import {
  BillingPortalError,
  invoiceDownloadUrl,
  portalClient,
  type CreateBillingPortalSession,
} from "../components/portal/client.js";
import { walletAmountCents } from "../components/portal/amounts.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const createSession: CreateBillingPortalSession = async () => ({
  token: "customer-scoped-session",
});
const customer = {
  id: "customer-one",
  name: "Customer One",
  firstname: null,
  lastname: null,
  email: null,
  legalName: null,
  taxIdentificationNumber: null,
  customerType: null,
  currency: "USD",
  applicableTimezone: "TZ_AMERICA_LOS_ANGELES",
  addressLine1: null,
  addressLine2: null,
  city: null,
  state: null,
  zipcode: null,
  country: null,
  shippingAddress: { addressLine1: "Keep this shipping address" },
};
const subscription = {
  id: "sub-one",
  externalId: "external-sub-one",
  status: "active",
  endingAt: null as string | null,
  nextSubscription: null,
  name: "Free subscription",
  currentBillingPeriodEndingAt: "2026-10-18T01:00:00Z",
  plan: {
    id: "plan-one",
    name: "Free",
    code: "free",
    invoiceDisplayName: null,
    amountCents: "0",
    amountCurrency: "USD",
    interval: "monthly",
  },
};
const pageOf = (collection: unknown[], totalPages = 1, currentPage = 1) => ({
  collection,
  metadata: { currentPage, totalPages, totalCount: collection.length },
});
type Operation = { query: string; variables: Record<string, any> };
function mockApi(
  override?: (
    operation: Operation,
    token: string,
  ) => unknown | Promise<unknown>,
) {
  const calls: Operation[] = [];
  const fetchMock = vi.fn(async (_url, init: RequestInit) => {
    const operation = JSON.parse(String(init.body)) as Operation;
    calls.push(operation);
    const token = new Headers(init.headers).get("customer-portal-token")!;
    const custom = await override?.(operation, token);
    if (custom !== undefined) return Response.json(custom);
    let data: object;
    if (operation.query.includes("SdkPortalIdentity"))
      data = {
        customerPortalUser: customer,
        customerPortalOrganization: { id: "org", name: "Example Inc" },
      };
    else if (operation.query.includes("SdkPortalSubscriptions"))
      data = { customerPortalSubscriptions: pageOf([subscription]) };
    else if (operation.query.includes("SdkPortalWallets"))
      data = { customerPortalWallets: pageOf([]) };
    else if (operation.query.includes("SdkPortalInvoices"))
      data = { customerPortalInvoices: pageOf([]) };
    else if (operation.query.includes("SdkPortalUsage"))
      data = {
        customerPortalCustomerUsage: {
          amountCents: "250",
          currency: "USD",
          fromDatetime: "2026-09-18T00:00:00Z",
          toDatetime: "2026-10-18T01:00:00Z",
          chargesUsage: [
            {
              id: "charge",
              units: 7,
              amountCents: "250",
              feature: { id: "metric", code: "api_calls", name: "API calls" },
              charge: null,
            },
          ],
        },
      };
    else if (operation.query.includes("SdkPortalUpdateCustomer"))
      data = { updateCustomerPortalCustomer: { id: customer.id } };
    else if (operation.query.includes("SdkPortalTopUp"))
      data = {
        createCustomerPortalWalletTransaction: {
          collection: [{ id: "transaction" }],
        },
      };
    else throw new Error("Unexpected operation");
    return Response.json({ data });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

describe("native BillingPortal", () => {
  it("connects cancellation to merchant actions and reloads saved end/keep state", async () => {
    let current = { ...subscription };
    const { calls } = mockApi(({ query }) => {
      if (query.includes("SdkPortalSubscriptions"))
        return { data: { customerPortalSubscriptions: pageOf([current]) } };
      if (query.includes("SdkPortalSubscription("))
        return { data: { customerPortalSubscription: current } };
    });
    const end = "2099-10-18T07:00:00Z";
    const actions = {
      preview: vi.fn(
        async ({ operation }: { operation: "cancel" | "uncancel" }) => ({
          operation,
          effectiveAt: end,
          renewalAt: end,
        }),
      ),
      apply: vi.fn(
        async ({ operation }: { operation: "cancel" | "uncancel" }) => {
          current = {
            ...current,
            endingAt: operation === "cancel" ? end : null,
          };
        },
      ),
    };
    render(
      <BillingPortal
        createSession={createSession}
        cancellationActions={actions}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Cancel subscription" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Confirm cancellation" }),
    );
    await screen.findByText("Scheduled to end");
    expect(screen.getByText("Cancellation scheduled.")).toBeTruthy();
    expect(screen.getByText(/Cancels on/)).toBeTruthy();
    expect(actions.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionId: "external-sub-one",
        operation: "cancel",
        expectedEffectiveAt: end,
      }),
    );
    expect(
      calls.some(
        ({ query, variables }) =>
          query.includes("SdkPortalSubscription(") &&
          variables.id === "sub-one",
      ),
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Refresh portal" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Keep my subscription" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Confirm keep subscription" }),
    );
    await screen.findByRole("button", { name: "Cancel subscription" });
    expect(screen.queryByText(/Cancels on/)).toBeNull();
  });

  it("loads customer data without a provider, iframe, browser secret, cookies, or persistent auth storage", async () => {
    const { fetchMock } = mockApi();
    localStorage.clear();
    render(<BillingPortal createSession={createSession} />);
    await screen.findByText("Free subscription");
    expect(
      screen.queryByRole("button", { name: "Cancel subscription" }),
    ).toBeNull();
    expect(
      screen.getByText("Current period ends Oct 17, 2026", { exact: false }),
    ).toBeTruthy();
    expect(screen.getByText("$0.00")).toBeTruthy();
    await screen.findByText("No invoices yet.");
    expect(document.querySelector("iframe")).toBeNull();
    expect(localStorage.length).toBe(0);
    for (const [url, init] of fetchMock.mock.calls) {
      expect(url).toBe("https://api.nozle.app/core/graphql");
      expect(init.credentials).toBe("omit");
      expect(new Headers(init.headers).get("authorization")).toBeNull();
      expect(new Headers(init.headers).get("customer-portal-token")).toBe(
        "customer-scoped-session",
      );
    }
    fireEvent.click(screen.getByRole("button", { name: "View usage" }));
    await screen.findByText("API calls");
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getAllByText("$2.50")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: /Back to overview/ }));
    await screen.findByText("Free subscription");
  });

  it("immediately hides the old customer and aborts old requests when the session callback changes", async () => {
    let finishOld: (value: unknown) => void = () => {};
    const { fetchMock } = mockApi(async ({ query }, token) => {
      if (token === "old-session" && query.includes("SdkPortalSubscriptions")) {
        return new Promise((resolve) => {
          finishOld = resolve;
        });
      }
      if (token === "new-session" && query.includes("SdkPortalIdentity"))
        return {
          data: {
            customerPortalUser: {
              ...customer,
              id: "two",
              name: "Customer Two",
            },
            customerPortalOrganization: { id: "org", name: "Example Inc" },
          },
        };
    });
    const first: CreateBillingPortalSession = async () => ({
      token: "old-session",
    });
    const second: CreateBillingPortalSession = async () => ({
      token: "new-session",
    });
    const { rerender } = render(<BillingPortal createSession={first} />);
    await screen.findByRole("button", { name: "Edit billing information" });
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([, init]) =>
          String(init.body).includes("SdkPortalSubscriptions"),
        ),
      ).toBe(true),
    );
    const oldSignals = fetchMock.mock.calls
      .filter(([, init]) =>
        String(init.body).includes("SdkPortalSubscriptions"),
      )
      .map(([, init]) => init.signal!);
    rerender(<BillingPortal createSession={second} />);
    expect(screen.queryByText("Customer One")).toBeNull();
    await screen.findAllByText("Customer Two");
    expect(oldSignals.every((signal) => signal.aborted)).toBe(true);
    await act(async () => {
      finishOld({
        data: {
          customerPortalSubscriptions: pageOf([
            { ...subscription, name: "PRIVATE OLD DATA" },
          ]),
        },
      });
    });
    expect(screen.queryByText("PRIVATE OLD DATA")).toBeNull();
    expect(screen.queryByText("Customer One")).toBeNull();
  });

  it("reconnects expired sessions and never renders upstream error bodies", async () => {
    let sessionCount = 0;
    const loader: CreateBillingPortalSession = async () => ({
      token: `session-${++sessionCount}`,
    });
    const onError = vi.fn();
    mockApi((_operation, token) =>
      token === "session-1"
        ? {
            errors: [
              {
                message: "secret upstream detail",
                extensions: { code: "unauthorized" },
              },
            ],
          }
        : undefined,
    );
    render(<BillingPortal createSession={loader} onError={onError} />);
    fireEvent.click(await screen.findByRole("button", { name: "Reconnect" }));
    await screen.findByText("Free subscription");
    expect(sessionCount).toBe(2);
    expect(document.body.textContent).not.toContain("secret upstream detail");
    expect(onError.mock.calls[0][0]).toMatchObject({ code: "unauthorized" });
  });

  it("retries a failed session loader without exposing its raw error", async () => {
    mockApi();
    const loader = vi
      .fn<CreateBillingPortalSession>()
      .mockRejectedValueOnce(new Error("secret-key"))
      .mockResolvedValueOnce({ token: "good-session" });
    render(<BillingPortal createSession={loader} />);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await screen.findByText("Free subscription");
    expect(document.body.textContent).not.toContain("secret-key");
  });

  it("saves only edited billing fields and prevents duplicate submissions", async () => {
    let finish: () => void = () => {};
    const { calls } = mockApi(async ({ query }) => {
      if (query.includes("SdkPortalUpdateCustomer")) {
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
        return { data: { updateCustomerPortalCustomer: { id: customer.id } } };
      }
    });
    render(<BillingPortal createSession={createSession} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Edit billing information" }),
    );
    fireEvent.change(screen.getByLabelText("Legal name"), {
      target: { value: "Example LLC" },
    });
    const save = screen.getByRole("button", {
      name: "Save billing information",
    });
    fireEvent.click(save);
    fireEvent.click(save);
    await waitFor(() =>
      expect(
        calls.filter(({ query }) => query.includes("SdkPortalUpdateCustomer")),
      ).toHaveLength(1),
    );
    expect(
      calls.find(({ query }) => query.includes("SdkPortalUpdateCustomer"))
        ?.variables,
    ).toEqual({ input: { legalName: "Example LLC" } });
    await act(async () => finish());
    await screen.findByText("Billing information saved.");
  });

  it("paginates subscriptions and resets invoice pagination on search", async () => {
    const { calls } = mockApi(({ query, variables }) => {
      if (query.includes("SdkPortalSubscriptions"))
        return {
          data: {
            customerPortalSubscriptions: pageOf(
              [
                {
                  ...subscription,
                  name:
                    variables.page === 2
                      ? "Second subscription"
                      : "First subscription",
                },
              ],
              2,
              variables.page,
            ),
          },
        };
      if (query.includes("SdkPortalInvoices"))
        return {
          data: { customerPortalInvoices: pageOf([], 2, variables.page) },
        };
    });
    render(<BillingPortal createSession={createSession} />);
    await screen.findByText("First subscription");
    fireEvent.click(
      within(screen.getByRole("region", { name: "Subscriptions" })).getByRole(
        "button",
        { name: "Next" },
      ),
    );
    await screen.findByText("Second subscription");
    expect(screen.queryByText("First subscription")).toBeNull();
    const invoices = within(
      screen.getByRole("region", { name: "Invoice history" }),
    );
    fireEvent.click(invoices.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(
        calls.some(
          ({ query, variables }) =>
            query.includes("SdkPortalInvoices") && variables.page === 2,
        ),
      ).toBe(true),
    );
    fireEvent.change(invoices.getByRole("searchbox"), {
      target: { value: "INV-42" },
    });
    fireEvent.click(invoices.getByRole("button", { name: "Search" }));
    await waitFor(() =>
      expect(calls.at(-1)?.variables).toEqual({
        page: 1,
        searchTerm: "INV-42",
      }),
    );
  });

  it("generates an invoice PDF and shows a safe link, including asynchronous generation", async () => {
    let downloads = 0;
    const { calls } = mockApi(({ query }) => {
      if (query.includes("SdkPortalInvoices"))
        return {
          data: {
            customerPortalInvoices: pageOf([
              {
                id: "invoice",
                number: "INV-42",
                issuingDate: "2026-09-18",
                totalAmountCents: "300",
                totalDueAmountCents: "0",
                currency: "JPY",
                paymentStatus: "succeeded",
                paymentOverdue: false,
                paymentDisputeLostAt: null,
              },
            ]),
          },
        };
      if (query.includes("SdkPortalDownloadInvoice"))
        return {
          data: {
            downloadCustomerPortalInvoice: {
              id: "invoice",
              fileUrl:
                ++downloads === 1
                  ? null
                  : "https://files.example.test/invoice.pdf",
            },
          },
        };
    });
    render(<BillingPortal createSession={createSession} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Download invoice INV-42" }),
    );
    await screen.findByText("PDF is being generated. Check again shortly.");
    fireEvent.click(
      screen.getByRole("button", { name: "Download invoice INV-42" }),
    );
    const link = await screen.findByRole("link", { name: "Open PDF" });
    expect(link.getAttribute("href")).toBe(
      "https://files.example.test/invoice.pdf",
    );
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.getByText("¥300")).toBeTruthy();
    expect(
      calls.find(({ query }) => query.includes("SdkPortalDownloadInvoice"))
        ?.variables,
    ).toEqual({ input: { id: "invoice" } });
  });

  it("validates wallet limits and submits exact credit text only after explicit confirmation", async () => {
    const { calls } = mockApi(({ query }) =>
      query.includes("SdkPortalWallets")
        ? {
            data: {
              customerPortalWallets: pageOf([
                {
                  id: "wallet",
                  name: "Prepaid",
                  currency: "USD",
                  balanceCents: "500",
                  creditsBalance: 5,
                  consumedCredits: 0,
                  expirationAt: null,
                  rateAmount: 1,
                  paidTopUpMinAmountCents: "200",
                  paidTopUpMaxAmountCents: "1000",
                },
              ]),
            },
          }
        : undefined,
    );
    render(<BillingPortal createSession={createSession} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add credits" }));
    const input = screen.getByLabelText("Credits to add");
    const submit = screen.getByRole("button", {
      name: "Confirm paid top-up",
    }) as HTMLButtonElement;
    for (const invalid of ["-2", "1", "11", "Infinity"]) {
      fireEvent.change(input, { target: { value: invalid } });
      expect(submit.disabled).toBe(true);
    }
    fireEvent.change(input, { target: { value: "2.50000" } });
    expect(submit.disabled).toBe(false);
    expect(calls.some(({ query }) => query.includes("SdkPortalTopUp"))).toBe(
      false,
    );
    fireEvent.click(submit);
    await screen.findByText(/Top-up requested/);
    expect(
      calls.find(({ query }) => query.includes("SdkPortalTopUp"))?.variables,
    ).toEqual({ input: { walletId: "wallet", paidCredits: "2.50000" } });
  });
});

describe("portal credential boundary", () => {
  it("compares wallet amounts at decimal limits without floating-point drift", () => {
    expect(walletAmountCents("0.29", 1, 2)).toBe("29");
    expect(walletAmountCents("10000000", 1e-7, 2)).toBe("100.00000");
    expect(walletAmountCents("-1", 1, 2)).toBeNull();
    expect(walletAmountCents("1", Infinity, 2)).toBeNull();
  });
  it("rejects secret keys and insecure endpoints before fetching", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const token of ["", "sk_secret", "pk_public", "token\nheader"])
      expect(() => portalClient({ token })).toThrow(BillingPortalError);
    for (const apiUrl of [
      "http://remote.test",
      "javascript:alert(1)",
      "https://user:pass@example.test",
      "https://example.test?token=secret",
    ])
      expect(() => portalClient({ token: "session", apiUrl })).toThrow(
        BillingPortalError,
      );
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("redacts HTTP and GraphQL errors and rejects partial data on an error response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("secret", { status: 403 }))
      .mockResolvedValueOnce(
        Response.json({
          data: { private: true },
          errors: [{ message: "secret" }],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const client = portalClient({ token: "session" });
    await expect(client.request("query {}")).rejects.toMatchObject({
      code: "unauthorized",
    });
    await expect(client.request("query {}")).rejects.toMatchObject({
      code: "request",
    });
  });
  it("serves Core invoice blobs through its public proxy while preserving the signed identifier", () => {
    expect(
      invoiceDownloadUrl(
        "https://api.nozle.app/core/rails/active_storage/blobs/redirect/signed-id/invoice%20one.pdf?download=1",
      ),
    ).toBe(
      "https://api.nozle.app/core/rails/active_storage/blobs/proxy/signed-id/invoice%20one.pdf?download=1",
    );
    expect(
      invoiceDownloadUrl("https://files.example.test/invoice.pdf?signed=token"),
    ).toBe("https://files.example.test/invoice.pdf?signed=token");
  });
  it("rejects unsafe invoice URLs", () => {
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,private",
      "http://example.test/a.pdf",
      "https://user:pass@example.test/a.pdf",
    ])
      expect(() => invoiceDownloadUrl(url)).toThrow(BillingPortalError);
  });
});
