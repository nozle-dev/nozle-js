"use client";

import React, { createContext, useContext, useMemo, type CSSProperties } from "react";
import { mergeAppearance, toCssVars, type Appearance, type ElementKey } from "./tokens.js";

const AppearanceContext = createContext<Appearance | undefined>(undefined);

/** Set by `BillingProvider`; renders no element of its own. */
export function AppearanceProvider({
  appearance,
  children,
}: {
  appearance?: Appearance;
  children: React.ReactNode;
}): React.ReactElement {
  return <AppearanceContext.Provider value={appearance}>{children}</AppearanceContext.Provider>;
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
}

/**
 * Resolves the provider's appearance with the component's own on top. Without any appearance no
 * variables are written, so CSS variables an app sets on `:root` keep working.
 */
export function useAppearance(appearance?: Appearance): UseAppearance {
  const inherited = useContext(AppearanceContext);
  return useMemo(() => {
    const { variables, elements, planCardLayout = "card" } = mergeAppearance(inherited, appearance);
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
      root: (key, style, className) => {
        const props = el(key, style, className);
        return { ...props, style: { ...vars, ...props.style } };
      },
    };
  }, [inherited, appearance]);
}
