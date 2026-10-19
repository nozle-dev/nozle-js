import type { CSSProperties } from "react";
import { buttonStyle } from "../../appearance/tokens.js";

export type PlanButtonState = "primary" | "current" | "secondary";

/**
 * Without a current plan (`isUpgrade` undefined) every plan is primary. With one: plans above it
 * are primary, the current plan has its own look, plans at or below it are secondary.
 */
export function planButtonState({ isCurrent, isUpgrade }: { isCurrent: boolean; isUpgrade?: boolean }): PlanButtonState {
  return isCurrent ? "current" : isUpgrade === false ? "secondary" : "primary";
}

/** The current plan's button: the primary colour without the theme's button shadow. */
export const currentButtonStyle: CSSProperties = {
  ...buttonStyle("primary"),
  boxShadow: "none",
  cursor: "default",
};
