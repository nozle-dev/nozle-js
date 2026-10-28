import React from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { cardSetupFrameUrl, mountCardSetup } from "../core/card-setup.js";
import { NozleCardSetup } from "../components/billing/NozleCardSetup.js";

const URL_ = "https://app.nozle.app/pay/abc?x=1";
const ORIGIN = "https://app.nozle.app";
const good = (status: string, mode = "setup") => ({ source: "nozle", type: "card_setup", status, mode });

function post(data: unknown, origin = ORIGIN, source?: Window | null) {
  const iframe = document.querySelector("iframe")!;
  window.dispatchEvent(
    new MessageEvent("message", { data, origin, source: source === undefined ? iframe.contentWindow : source }),
  );
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("cardSetupFrameUrl", () => {
  it("adds embed=1 and validates scheme", () => {
    expect(cardSetupFrameUrl(URL_).searchParams.get("embed")).toBe("1");
    expect(() => cardSetupFrameUrl("http://example.com/x")).toThrow();
    expect(() => cardSetupFrameUrl("javascript:alert(1)")).toThrow();
    expect(() => cardSetupFrameUrl("https://u:p@example.com/")).toThrow();
    expect(cardSetupFrameUrl("http://localhost:3000/x").protocol).toBe("http:");
  });
});

describe("mountCardSetup", () => {
  function mount() {
    const cb = { onReady: vi.fn(), onResult: vi.fn(), onError: vi.fn() };
    const handle = mountCardSetup({ url: URL_, container: document.body, ...cb });
    return { cb, handle };
  }

  it("creates the frame", () => {
    mount();
    const f = document.querySelector("iframe")!;
    expect(f.src).toContain("embed=1");
    expect(f.getAttribute("allow")).toBe("payment");
    expect(f.title).toBeTruthy();
    expect(f.hasAttribute("sandbox")).toBe(false);
  });

  it("ignores wrong origin, source window, shape and unknown status", () => {
    const { cb } = mount();
    post(good("ready"), "https://evil.example");
    post(good("ready"), ORIGIN, window);
    post(good("ready"), ORIGIN, null);
    post("ready");
    post(null);
    post({ ...good("ready"), source: "other" });
    post({ ...good("ready"), type: "other" });
    post(good("exploded"));
    expect(cb.onReady).not.toHaveBeenCalled();
    expect(cb.onResult).not.toHaveBeenCalled();
    expect(cb.onError).not.toHaveBeenCalled();
  });

  it("accepts valid statuses", () => {
    const { cb } = mount();
    post(good("ready", "pay"));
    expect(cb.onReady).toHaveBeenCalledWith({ mode: "pay" });
    for (const s of ["succeeded", "processing", "failed"]) post(good(s, "bogus"));
    expect(cb.onResult.mock.calls.map((c) => c[0])).toEqual([
      { status: "succeeded", mode: undefined },
      { status: "processing", mode: undefined },
      { status: "failed", mode: undefined },
    ]);
    post(good("error"));
    expect(cb.onError).toHaveBeenCalledWith({ reason: "load" });
  });

  it("times out only when neither ready nor error arrived", () => {
    const a = mount();
    vi.advanceTimersByTime(15000);
    expect(a.cb.onError).toHaveBeenCalledWith({ reason: "timeout" });
    document.body.innerHTML = "";
    const b = mount();
    post(good("ready"));
    vi.advanceTimersByTime(60000);
    expect(b.cb.onError).not.toHaveBeenCalled();
  });

  it("cleans up on unmount", () => {
    const { cb, handle } = mount();
    const f = document.querySelector("iframe")!;
    handle.unmount();
    expect(document.querySelector("iframe")).toBeNull();
    window.dispatchEvent(new MessageEvent("message", { data: good("ready"), origin: ORIGIN, source: f.contentWindow }));
    vi.advanceTimersByTime(60000);
    expect(cb.onReady).not.toHaveBeenCalled();
    expect(cb.onError).not.toHaveBeenCalled();
  });
});

describe("NozleCardSetup", () => {
  it("renders on the server without window access", () => {
    expect(renderToString(<NozleCardSetup url={URL_} />)).toContain("Loading");
  });

  it("calls callbacks and hides loading once ready", () => {
    const h = { onSuccess: vi.fn(), onProcessing: vi.fn(), onFailure: vi.fn(), onError: vi.fn() };
    const { container } = render(<NozleCardSetup result={{ url: URL_ }} {...h} />);
    expect(container.querySelector("iframe")).not.toBeNull();
    act(() => post(good("ready")));
    expect(container.querySelector("[role=status]")).toBeNull();
    act(() => post(good("succeeded")));
    act(() => post(good("processing")));
    act(() => post(good("failed")));
    expect(h.onSuccess).toHaveBeenCalledWith({ mode: "setup" });
    expect(h.onProcessing).toHaveBeenCalled();
    expect(h.onFailure).toHaveBeenCalled();
  });

  it("redirects on timeout by default, not with fallback none", () => {
    const assign = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, assign } as Location);
    const onError = vi.fn();
    const r = render(<NozleCardSetup url={URL_} onError={onError} timeoutSeconds={1} />);
    act(() => void vi.advanceTimersByTime(1000));
    expect(onError).toHaveBeenCalledWith({ reason: "timeout" });
    expect(assign).toHaveBeenCalledWith(URL_);
    r.unmount();
    assign.mockClear();
    render(<NozleCardSetup url={URL_} fallback="none" timeoutSeconds={1} />);
    act(() => void vi.advanceTimersByTime(1000));
    expect(assign).not.toHaveBeenCalled();
  });

  it("reports an invalid url without redirecting and removes the frame on unmount", () => {
    const onError = vi.fn();
    render(<NozleCardSetup url="http://example.com/x" onError={onError} />);
    expect(onError).toHaveBeenCalledWith({ reason: "invalid_url" });
    cleanup();
    render(<NozleCardSetup url={URL_} />).unmount();
    expect(document.querySelector("iframe")).toBeNull();
  });
});
