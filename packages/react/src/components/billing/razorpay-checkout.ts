import type {
  CheckoutResult,
  CheckoutStatus,
  RazorpayCheckoutResult,
  RazorpayVerification,
  VerifyCheckout,
  GetCheckoutStatus,
} from '../../provider.js';

export interface RazorpayActions {
  verifyCheckout?: VerifyCheckout;
  getCheckoutStatus?: GetCheckoutStatus;
  onSuccess?: (paymentId: string) => void;
  onProcessing?: (status: CheckoutStatus) => void;
  onDismiss?: () => void;
  onError?: (error: Error) => void;
}

interface RazorpayOptions {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  customer_id?: string;
  recurring?: '1';
  handler: (response: RazorpayVerification) => void;
  modal: { ondismiss: () => void };
}
interface RazorpayInstance {
  open(): void;
  close(): void;
  on(event: string, callback: () => void): void;
}
declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}
let loadingScript: Promise<void> | undefined;

export function loadRazorpayScript(): Promise<void> {
  if (typeof window === 'undefined')
    return Promise.reject(new Error('Razorpay checkout requires a browser'));
  if (window.Razorpay) return Promise.resolve();
  if (loadingScript) return loadingScript;
  loadingScript = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://checkout.razorpay.com/v1/checkout.js"]',
    );
    const script = existing || document.createElement('script');
    const finish = (error?: Error) => {
      clearTimeout(timer);
      script.removeEventListener('load', onLoad);
      script.removeEventListener('error', onError);
      if (error) {
        script.remove();
        reject(error);
      } else {
        resolve();
      }
    };
    const onLoad = () =>
      finish(
        window.Razorpay
          ? undefined
          : new Error('Razorpay checkout did not initialize'),
      );
    const onError = () => finish(new Error('Failed to load Razorpay checkout'));
    const timer = setTimeout(
      () => finish(new Error('Razorpay checkout timed out while loading')),
      15000,
    );
    script.addEventListener('load', onLoad);
    script.addEventListener('error', onError);
    if (!existing) {
      script.id = 'razorpay-js';
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      document.body.appendChild(script);
    }
  }).catch((error) => {
    loadingScript = undefined;
    throw error;
  });
  return loadingScript;
}

function checkStatus(status: CheckoutStatus, id: string): void {
  if (status.checkout_id !== id || status.provider !== 'razorpay')
    throw new Error('Checkout status did not match this checkout');
  if (['failed', 'expired', 'needs_review'].includes(status.status))
    throw new Error(`Checkout ${status.status.replaceAll('_', ' ')}`);
}

export async function waitForCheckout(
  id: string,
  actions: RazorpayActions,
  initial?: CheckoutStatus,
): Promise<CheckoutStatus> {
  let status = initial;
  if (!status && !actions.getCheckoutStatus)
    throw new Error('BillingProvider getCheckoutStatus callback is required');
  for (let attempt = 0; attempt < 30; attempt++) {
    status = status || (await actions.getCheckoutStatus!(id));
    checkStatus(status, id);
    if (
      (status.status === 'succeeded' &&
        status.fulfillment_status === 'succeeded') ||
      status.status === 'awaiting_payment'
    )
      return status;
    actions.onProcessing?.(status);
    if (!actions.getCheckoutStatus) return status;
    if (attempt < 29) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      status = undefined;
    }
  }
  return status!;
}

export async function openRazorpayCheckout(
  result: RazorpayCheckoutResult,
  actions: RazorpayActions,
): Promise<void> {
  if (!result.checkout_id || !result.key_id || !result.order_id)
    throw new Error(
      'Razorpay checkout requires server-issued checkout_id, key_id and order_id',
    );
  if (!actions.verifyCheckout)
    throw new Error(
      'BillingProvider verifyCheckout callback is required for Razorpay checkout',
    );
  await loadRazorpayScript();
  await new Promise<void>((resolve, reject) => {
    let finishing = false;
    const checkout = new window.Razorpay!({
      key: result.key_id,
      order_id: result.order_id,
      amount: result.amount_cents,
      currency: result.currency,
      ...(result.recurring && {
        customer_id: result.customer_id,
        recurring: '1' as const,
      }),
      handler: (response) => {
        if (finishing) return;
        finishing = true;
        void (async () => {
          const verified = await actions.verifyCheckout!(
            result.checkout_id,
            response,
          );
          const status = await waitForCheckout(
            result.checkout_id,
            actions,
            verified,
          );
          if (
            status.status === 'succeeded' &&
            status.fulfillment_status === 'succeeded'
          )
            actions.onSuccess?.(response.razorpay_payment_id);
          else actions.onProcessing?.(status);
          resolve();
        })().catch(reject);
      },
      modal: {
        ondismiss: () => {
          if (!finishing) {
            finishing = true;
            actions.onDismiss?.();
            resolve();
          }
        },
      },
    });
    checkout.on('payment.failed', () => {
      if (finishing) return;
      finishing = true;
      checkout.close();
      reject(new Error('Payment failed. You can retry checkout.'));
    });
    checkout.open();
  });
}

export async function resumeCheckout(
  result: Extract<CheckoutResult, { type: 'processing' }>,
  actions: RazorpayActions,
): Promise<CheckoutResult | undefined> {
  const status = await waitForCheckout(result.checkout_id, actions);
  if (status.status === 'awaiting_payment') return status.checkout;
  if (
    status.status === 'succeeded' &&
    status.fulfillment_status === 'succeeded'
  )
    return {
      type: 'completed',
      status: 'succeeded',
      invoice_id: status.invoice_id || undefined,
    };
  actions.onProcessing?.(status);
  return undefined;
}
