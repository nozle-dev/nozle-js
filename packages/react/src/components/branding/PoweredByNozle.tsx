"use client";

import React, { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOptionalBillingContext } from "../../provider.js";
import { catalogQuery, idleQueryClient } from "../../hooks/use-plans.js";
import { useAppearance } from "../../appearance/context.js";
import { T, text } from "../../appearance/tokens.js";
import { LOGO_MARK_PATH, LOGO_VIEW_BOX, LOGO_WORDMARK_PATH } from "./logo.js";

// Set inside a branded component, so a branded component it renders (Checkout in a modal, the
// modal in the portal) does not repeat the badge.
const BrandingScope = createContext(false);

/**
 * Whether the merchant's Nozle plan keeps the "Powered by Nozle" badge. The server decides
 * (`meta.nozle_branding` in the publishable-key plan catalog); without a BillingProvider, or
 * before the answer arrives, there is no badge.
 */
export function useNozleBranding(): boolean {
  const billing = useOptionalBillingContext();
  const { data } = useQuery(
    // Reads the catalog request the components already make: mounting this must not refetch a
    // failed catalog, or a table that shows the error would loop back into loading.
    { ...catalogQuery(billing?.client), enabled: Boolean(billing), refetchOnMount: false, retryOnMount: false },
    billing?.queryClient ?? idleQueryClient,
  );
  return data?.nozleBranding === true;
}

/** "Powered by" and the Nozle logo, linking to nozle.dev. */
export function PoweredByNozle(): React.ReactElement {
  // root, not el: on its own the badge needs the theme's variables, not only its class.
  const { root } = useAppearance();
  return (
    <a
      href="https://nozle.dev"
      target="_blank"
      rel="noopener noreferrer"
      {...root("poweredBy", {
        ...text.meta,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "6px",
        marginTop: "1rem",
        textDecoration: "none",
      })}
    >
      Powered by
      <svg viewBox={LOGO_VIEW_BOX} height="14" width="40" role="img" aria-label="Nozle" style={{ color: T.foreground }}>
        <path fill="#F34213" d={LOGO_MARK_PATH} />
        <path fill="currentColor" d={LOGO_WORDMARK_PATH} />
      </svg>
    </a>
  );
}

/**
 * Wraps a branded component's content and adds the badge after it, once: only the outermost
 * branded component shows it. `show` overrides the catalog answer (the portal has its own).
 */
export function NozleBranding({ show, children }: { show?: boolean; children?: ReactNode }): React.ReactElement {
  const nested = useContext(BrandingScope);
  const fromCatalog = useNozleBranding();
  return (
    <BrandingScope.Provider value={true}>
      {children}
      {!nested && (show ?? fromCatalog) && <PoweredByNozle />}
    </BrandingScope.Provider>
  );
}
