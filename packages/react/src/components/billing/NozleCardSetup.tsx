"use client";

import React, { useEffect, useRef, useState } from "react";
import { mountCardSetup, type CardSetupMode } from "../../core/card-setup.js";
import type { HostedCheckoutResult } from "../../provider.js";

export interface NozleCardSetupProps {
  /** The Nozle card page URL. Use `result` instead to pass a hosted checkout result. */
  url?: string;
  result?: Pick<HostedCheckoutResult, "url">;
  onSuccess?: (info: { mode?: CardSetupMode }) => void;
  onProcessing?: (info: { mode?: CardSetupMode }) => void;
  onFailure?: (info: { mode?: CardSetupMode }) => void;
  /** Called when the form cannot load or times out. */
  onError?: (error: { reason: "timeout" | "load" | "invalid_url" }) => void;
  /** `redirect` (default) sends the customer to the page itself when the frame cannot load. */
  fallback?: "redirect" | "none";
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  minHeight?: number;
  timeoutSeconds?: number;
}

/** Shows the Nozle card form inside the page. Never redirects unless the frame fails. */
export function NozleCardSetup(props: NozleCardSetupProps) {
  const target = props.url ?? props.result?.url;
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    const container = ref.current;
    if (!container || !target) return;
    setReady(false);
    const fail = (reason: "timeout" | "load" | "invalid_url") => {
      const p = latest.current;
      p.onError?.({ reason });
      if (reason !== "invalid_url" && (p.fallback ?? "redirect") === "redirect") {
        window.location.assign(target);
      }
    };
    let handle: { unmount: () => void };
    try {
      handle = mountCardSetup({
        url: target,
        container,
        minHeight: latest.current.minHeight,
        timeoutSeconds: latest.current.timeoutSeconds,
        title: latest.current.title,
        onReady: () => setReady(true),
        onError: ({ reason }) => fail(reason),
        onResult: ({ status, mode }) => {
          const p = latest.current;
          if (status === "succeeded") p.onSuccess?.({ mode });
          else if (status === "processing") p.onProcessing?.({ mode });
          else p.onFailure?.({ mode });
        },
      });
    } catch {
      fail("invalid_url");
      return;
    }
    return () => handle.unmount();
  }, [target]);

  return (
    <div ref={ref} className={props.className} style={{ position: "relative", ...props.style }}>
      {!ready && (
        <div role="status" aria-live="polite" style={{ position: "absolute", padding: 16 }}>
          Loading secure card form…
        </div>
      )}
    </div>
  );
}
