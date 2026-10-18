"use client";

import React, { createContext, useContext, useMemo, type CSSProperties } from "react";
import type { SavedPricingTable } from "./saved.js";
import { mergeAppearance, toCssVars, type Appearance, type ElementKey } from "./tokens.js";

interface AppearanceValue {
  /** The appearance saved in the dashboard: the lowest layer. */
  saved?: Appearance;
  savedPricingTable?: SavedPricingTable;
  /** The `appearance` prop of `BillingProvider`. */
  appearance?: Appearance;
}

const AppearanceContext = createContext<AppearanceValue>({});

/** Set by `BillingProvider`; renders no element of its own. */
export function AppearanceProvider({
  saved,
  savedPricingTable,
  appearance,
  children,
}: AppearanceValue & { children: React.ReactNode }): React.ReactElement {
  const value = useMemo(() => ({ saved, savedPricingTable, appearance }), [saved, savedPricingTable, appearance]);
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

/** Pricing table defaults saved in the dashboard; props of the component win. */
export function useSavedPricingTable(): SavedPricingTable | undefined {
  return useContext(AppearanceContext).savedPricingTable;
}

export interface ElementProps {
  className?: string;
  style?: CSSProperties;
}

export interface UseAppearance {
  /** Props for a component's root: its `nozle-<key>` class, the theme's CSS variables and its element overrides. */
  root(key: ElementKey, style?: CSSProperties, className?: string): ElementProps;
  /** Props for an inner element: its `nozle-<key>` class and its element overrides. */
  el(key: ElementKey, style?: CSSProperties, className?: string): ElementProps;
  /** The plan card layout the theme asks for. */
  planCardLayout: "card" | "panel";
  /** The theme's CSS variables, for an element rendered beside the root rather than inside it. */
  vars: CSSProperties;
}

/**
 * Resolves the saved appearance and the provider's with the component's own on top. Without any appearance no
 * variables are written, so CSS variables an app sets on `:root` keep working.
 */
export function useAppearance(appearance?: Appearance): UseAppearance {
  const { saved, appearance: inherited } = useContext(AppearanceContext);
  return useMemo(() => {
    const { variables, elements, planCardLayout = "card" } = mergeAppearance(saved, inherited, appearance);
    const vars = toCssVars(variables);
    const el = (key: ElementKey, style?: CSSProperties, className?: string): ElementProps => {
      const override = elements[key];
      return {
        className: ["nozle-" + key, className, override?.className].filter(Boolean).join(" "),
        style: { ...style, ...override?.style },
      };
    };
    return {
      el,
      planCardLayout,
      vars,
      root: (key, style, className) => {
        const props = el(key, style, className);
        return { ...props, style: { ...vars, ...props.style } };
      },
    };
  }, [saved, inherited, appearance]);
}
