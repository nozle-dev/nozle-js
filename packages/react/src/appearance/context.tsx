"use client";

import React, { createContext, useContext, useMemo, type CSSProperties } from "react";
import type { SavedAppearance, SavedComponent, SavedPricingTable } from "./saved.js";
import { mergeAppearance, toCssVars, type Appearance, type ElementKey } from "./tokens.js";

interface AppearanceValue {
  /** The appearance saved in the dashboard: the lowest layer. */
  saved?: Appearance;
  savedPricingTable?: SavedPricingTable;
  /** What the dashboard saved for single components: above the global layer, below code. */
  savedComponents?: SavedAppearance["components"];
  /** The `appearance` prop of `BillingProvider`. */
  appearance?: Appearance;
}

const AppearanceContext = createContext<AppearanceValue>({});

/** Set by `BillingProvider`; renders no element of its own. */
export function AppearanceProvider({
  saved,
  savedPricingTable,
  savedComponents,
  appearance,
  children,
}: AppearanceValue & { children: React.ReactNode }): React.ReactElement {
  const value = useMemo(
    () => ({ saved, savedPricingTable, savedComponents, appearance }),
    [saved, savedPricingTable, savedComponents, appearance],
  );
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

/** Pricing table defaults saved in the dashboard, the component's own over the global ones; props win. */
export function useSavedPricingTable(component?: SavedComponent): SavedPricingTable | undefined {
  const { savedPricingTable, savedComponents } = useContext(AppearanceContext);
  const own = component ? savedComponents?.[component]?.pricingTable : undefined;
  return own ? { ...savedPricingTable, ...own } : savedPricingTable;
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
 * Resolves, lowest first: the appearance saved for the organization, the one saved for this component, the
 * provider's and the component's own props. Without any appearance no variables are written, so CSS variables
 * an app sets on `:root` keep working.
 */
export function useAppearance(appearance?: Appearance, component?: SavedComponent): UseAppearance {
  const { saved, savedComponents, appearance: inherited } = useContext(AppearanceContext);
  const savedOwn = component ? savedComponents?.[component]?.appearance : undefined;
  return useMemo(() => {
    const { variables, elements, planCardLayout = "card" } = mergeAppearance(saved, savedOwn, inherited, appearance);
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
  }, [saved, savedOwn, inherited, appearance]);
}
