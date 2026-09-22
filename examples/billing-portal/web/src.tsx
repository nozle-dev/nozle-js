import { useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import {
  BillingPortal,
  BillingPortalError,
  type CancellationActions,
  type PlanChangeActions,
  type CreateBillingPortalSession,
} from "@nozle-js/react";

async function post(path: string, body: object, signal?: AbortSignal) {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok)
    throw new BillingPortalError(
      [401, 403].includes(response.status)
        ? "unauthorized"
        : response.status === 409
          ? "changed"
          : "request",
    );
  return response.json();
}
const createSession: CreateBillingPortalSession = ({ signal }) =>
  post("/api/billing/session", {}, signal);
const cancellationActions: CancellationActions = {
  preview: ({ signal, ...body }) =>
    post("/api/billing/cancellation/preview", body, signal),
  apply: ({ signal, ...body }) =>
    post("/api/billing/cancellation", body, signal),
};
const planChangeActions: PlanChangeActions = {
  load: ({ signal, ...body }) => post("/api/billing/plans/load", body, signal),
  status: ({ signal, ...body }) =>
    post("/api/billing/plans/status", body, signal),
  preview: ({ signal, ...body }) =>
    post("/api/billing/plans/preview", body, signal),
  apply: ({ signal, ...body }) =>
    post("/api/billing/plans/apply", body, signal),
  withdraw: ({ signal, ...body }) =>
    post("/api/billing/plans/withdraw", body, signal),
  getCheckoutStatus: ({ signal, ...body }) =>
    post("/api/billing/plans/checkout-status", body, signal),
  verifyCheckout: ({ signal, ...body }) =>
    post("/api/billing/plans/checkout-verify", body, signal),
};

function App() {
  const [signedIn, setSignedIn] = useState(false);
  const [error, setError] = useState("");
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const token = new FormData(form).get("token");
    setError("");
    try {
      await post("/api/login", { token });
      form.reset();
      setSignedIn(true);
    } catch {
      setError("Sign in failed. Check your demo login token.");
    }
  }
  return (
    <main
      style={{
        maxWidth: 900,
        margin: "40px auto",
        padding: 20,
        fontFamily: "system-ui",
      }}
    >
      {signedIn ? (
        <BillingPortal
          createSession={createSession}
          cancellationActions={cancellationActions}
          planChangeActions={planChangeActions}
        />
      ) : (
        <>
          <h1>Subscription management demo</h1>
          <p>Sign in using the token configured by the demo operator.</p>
          <form onSubmit={login}>
            <label>
              Login token{" "}
              <input name="token" type="password" autoComplete="off" required />
            </label>{" "}
            <button type="submit">Sign in</button>
          </form>
          {error && <p role="alert">{error}</p>}
        </>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
