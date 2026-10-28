export type CardSetupStatus = "succeeded" | "processing" | "failed";
export type CardSetupMode = "setup" | "pay";
export type CardSetupErrorReason = "timeout" | "load";

export interface MountCardSetupOptions {
  /** The Nozle card page URL (hosted checkout url or manage payment method url). */
  url: string;
  container: HTMLElement;
  onReady?: (info: { mode: CardSetupMode | undefined }) => void;
  onResult?: (result: { status: CardSetupStatus; mode: CardSetupMode | undefined }) => void;
  onError?: (error: { reason: CardSetupErrorReason }) => void;
  /** Frame height in px before the page is ready. Default 480. */
  minHeight?: number;
  /** Seconds to wait for `ready` or `error`. Default 15; 0 disables. */
  timeoutSeconds?: number;
  title?: string;
}

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/** Returns the framed (`embed=1`) URL, or throws when `url` is not https (http only on localhost). */
export function cardSetupFrameUrl(url: string): URL {
  const parsed = new URL(url);
  const local = LOCAL_HOSTS.includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && local)) {
    throw new Error("Card setup URL must use HTTPS");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Card setup URL must not contain credentials");
  }
  parsed.searchParams.set("embed", "1");
  return parsed;
}

/**
 * Frames the Nozle card page. The SDK never sees card data: the page runs Stripe.js itself.
 * Only messages from the frame's own window AND the card page's origin are read.
 */
export function mountCardSetup(options: MountCardSetupOptions): { unmount: () => void } {
  const frameUrl = cardSetupFrameUrl(options.url);
  const doc = options.container.ownerDocument;
  const iframe = doc.createElement("iframe");
  iframe.src = frameUrl.toString();
  iframe.title = options.title ?? "Secure card form";
  // Stripe's Payment Element and 3DS need scripts, same-origin and popups, so `sandbox` is not
  // used; framing is already restricted to the integrator's origin by Nozle, and `allow` is
  // limited to the Payment Request API. No referrer leaks the host path.
  iframe.setAttribute("allow", "payment");
  iframe.referrerPolicy = "strict-origin";
  iframe.style.cssText = `width:100%;border:0;display:block;min-height:${options.minHeight ?? 480}px`;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let settled = false;
  const clear = () => {
    settled = true;
    if (timer !== undefined) clearTimeout(timer);
  };
  const view = doc.defaultView ?? window;
  const handler = (event: MessageEvent) => {
    if (event.origin !== frameUrl.origin) return;
    if (event.source === null || event.source !== iframe.contentWindow) return;
    const data = event.data as unknown;
    if (typeof data !== "object" || data === null) return;
    const { source, type, status, mode } = data as Record<string, unknown>;
    if (source !== "nozle" || type !== "card_setup") return;
    const safeMode = mode === "setup" || mode === "pay" ? mode : undefined;
    if (status === "ready") {
      clear();
      options.onReady?.({ mode: safeMode });
    } else if (status === "error") {
      clear();
      options.onError?.({ reason: "load" });
    } else if (status === "succeeded" || status === "processing" || status === "failed") {
      clear();
      options.onResult?.({ status, mode: safeMode });
    }
  };
  view.addEventListener("message", handler);
  options.container.appendChild(iframe);
  const seconds = options.timeoutSeconds ?? 15;
  if (seconds > 0) {
    timer = setTimeout(() => {
      if (!settled) options.onError?.({ reason: "timeout" });
    }, seconds * 1000);
  }
  return {
    unmount() {
      if (timer !== undefined) clearTimeout(timer);
      view.removeEventListener("message", handler);
      iframe.remove();
    },
  };
}
