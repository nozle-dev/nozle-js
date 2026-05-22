import type { HTMLAttributes } from "react";

export interface UsageMeterProps extends HTMLAttributes<HTMLDivElement> {
  metric: string;
  variant?: "bar" | "ring" | "minimal";
}

export interface PlanBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "pill" | "text" | "icon";
}

export interface UpgradePromptProps extends HTMLAttributes<HTMLDivElement> {
  feature?: string;
  variant?: "card" | "banner" | "inline";
  upgradeUrl?: string;
  message?: string;
}
