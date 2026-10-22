"use client";

import React from "react";
import { useAppearance } from "../../appearance/context.js";
import { T, buttonStyle, text, type Appearance } from "../../appearance/tokens.js";
import { useManagePaymentMethod } from "../../hooks/use-manage-payment-method.js";

export interface ManagePaymentMethodButtonProps {
  returnUrl?: string;
  /** Called when the request fails, for example `razorpay_pays_by_link` for a Razorpay customer. */
  onError?: (error: Error) => void;
  label?: string;
  className?: string;
  appearance?: Appearance;
  style?: React.CSSProperties;
}

export function ManagePaymentMethodButton({
  returnUrl,
  label = "Manage payment method",
  className,
  style,
  appearance,
  onError,
}: ManagePaymentMethodButtonProps): React.ReactElement {
  const { root, vars } = useAppearance(appearance, "CheckoutButton");
  const { managePaymentMethod, isLoading, error } = useManagePaymentMethod();
  return (
    <>
      <button
        type="button"
        onClick={() =>
          void managePaymentMethod(returnUrl).catch((cause: Error) => onError?.(cause))
        }
        disabled={isLoading}
        {...root("checkoutButton", { ...buttonStyle("primary", isLoading), ...style }, className)}
        aria-busy={isLoading}
      >
        {isLoading ? "Loading..." : label}
      </button>
      {error && <span role="alert" style={{ ...vars, ...text.body, color: T.dangerText }}>{error.message}</span>}
    </>
  );
}
