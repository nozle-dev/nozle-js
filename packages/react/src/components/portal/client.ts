/** A short-lived customer-portal credential issued by the merchant's backend. */
export interface BillingPortalSession {
  token: string;
  /** Nozle Core base URL, without /graphql. Defaults to https://api.nozle.app/core. */
  apiUrl?: string;
}

export type CreateBillingPortalSession = (options: {
  signal: AbortSignal;
}) => Promise<BillingPortalSession>;

export class BillingPortalError extends Error {
  constructor(
    public readonly code: "session" | "unauthorized" | "request" | "changed",
  ) {
    super(
      code === "changed"
        ? "Your subscription changed. Review its latest details before confirming again."
        : code === "unauthorized"
          ? "Your billing session has expired. Reconnect to continue."
          : code === "session"
            ? "Could not start your billing session. Please try again."
            : "Could not complete this billing request. Please try again.",
    );
    this.name = "BillingPortalError";
  }
}

/** Internal transport: never attaches merchant secret keys, cookies or a customer ID. */
export function portalClient(session: BillingPortalSession) {
  let endpoint: URL;
  try {
    endpoint = new URL(
      `${(session.apiUrl ?? "https://api.nozle.app/core").replace(/\/$/, "")}/graphql`,
    );
    if (
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash ||
      (endpoint.protocol !== "https:" &&
        !(
          endpoint.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname)
        )) ||
      !session.token?.trim() ||
      /^(sk_|pk_)/.test(session.token) ||
      /[\r\n]/.test(session.token)
    ) {
      throw new Error();
    }
  } catch {
    throw new BillingPortalError("session");
  }

  return {
    async request<T>(
      query: string,
      variables: Record<string, unknown> = {},
      signal?: AbortSignal,
    ): Promise<T> {
      const controller = new AbortController();
      const abort = () => controller.abort();
      if (signal?.aborted) abort();
      signal?.addEventListener("abort", abort, { once: true });
      const timeout = setTimeout(abort, 20000);
      try {
        const response = await fetch(endpoint.href, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "customer-portal-token": session.token,
          },
          body: JSON.stringify({ query, variables }),
          credentials: "omit",
          cache: "no-store",
          redirect: "error",
          referrerPolicy: "no-referrer",
          signal: controller.signal,
        });
        if ([401, 403].includes(response.status))
          throw new BillingPortalError("unauthorized");
        if (!response.ok) throw new BillingPortalError("request");
        const body = await response.json();
        if (body.errors?.length) {
          const unauthorized = body.errors.some(
            (error: { extensions?: { code?: string; status?: string } }) =>
              error.extensions?.code === "unauthorized" ||
              error.extensions?.status === "unauthorized",
          );
          throw new BillingPortalError(
            unauthorized ? "unauthorized" : "request",
          );
        }
        if (!body.data || typeof body.data !== "object")
          throw new BillingPortalError("request");
        return body.data as T;
      } catch (error) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        throw error instanceof BillingPortalError
          ? error
          : new BillingPortalError("request");
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abort);
      }
    },
  };
}

export type PortalClient = ReturnType<typeof portalClient>;

export function invoiceDownloadUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password)
      throw new Error();
    // Core's Active Storage redirect can point at a private object-store host.
    // Its standard proxy route serves the same signed blob through the public
    // API origin, retaining the signed identifier and any query parameters.
    url.pathname = url.pathname.replace(
      "/rails/active_storage/blobs/redirect/",
      "/rails/active_storage/blobs/proxy/",
    );
    return url.href;
  } catch {
    throw new BillingPortalError("request");
  }
}
