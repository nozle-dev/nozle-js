"use client";

import React from "react";
import { useAppearance } from "../../appearance/context.js";
import { T, buttonStyle, text, type Appearance } from "../../appearance/tokens.js";
import { useManagePaymentMethod } from "../../hooks/use-manage-payment-method.js";
import type { RazorpayActions } from "./razorpay-checkout.js";

export interface ManagePaymentMethodButtonProps
  extends Pick<RazorpayActions, "onSuccess" | "onProcessing" | "onDismiss" | "onError"> {
  returnUrl?: string;
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
  onSuccess,
  onProcessing,
  onDismiss,
  onError,
}: ManagePaymentMethodButtonProps): React.ReactElement {
  const { root, vars } = useAppearance(appearance, "CheckoutButton");
  const { managePaymentMethod, isLoading, error } = useManagePaymentMethod();
  return (
    <>
      <button
        type="button"
        onClick={() =>
          void managePaymentMethod(returnUrl, { onSuccess, onProcessing, onDismiss }).catch(
            (cause: Error) => onError?.(cause),
          )
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
