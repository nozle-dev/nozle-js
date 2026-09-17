import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleCheckoutResult } from '../components/billing/CheckoutButton.js';
import {
  loadRazorpayScript,
  resumeCheckout,
  waitForCheckout,
} from '../components/billing/razorpay-checkout.js';
import type {
  CheckoutStatus,
  RazorpayCheckoutResult,
  RazorpayVerification,
} from '../provider.js';

const checkout: RazorpayCheckoutResult = {
  type: 'razorpay',
  checkout_id: 'checkout-1',
  key_id: 'rzp_test_public',
  order_id: 'order_stored',
  amount_cents: 10000,
  currency: 'INR',
};
const callback: RazorpayVerification = {
  razorpay_order_id: 'order_stored',
  razorpay_payment_id: 'pay_example',
  razorpay_signature: 'signed',
};
const status: CheckoutStatus = {
  checkout_id: 'checkout-1',
  provider: 'razorpay',
  status: 'succeeded',
  fulfillment_status: 'succeeded',
};
let options: {
  handler: (value: RazorpayVerification) => void;
  modal: { ondismiss: () => void };
  key: string;
  order_id: string;
};
function install() {
  window.Razorpay = class {
    constructor(value: typeof options) {
      options = value;
    }
    open() {}
    close() {}
    on() {}
  } as typeof window.Razorpay;
}
afterEach(() => {
  delete window.Razorpay;
  vi.useRealTimers();
  document.querySelector('#razorpay-js')?.remove();
});

describe('Razorpay checkout confirmation', () => {
  it('uses server credentials and only succeeds after backend verification and fulfillment', async () => {
    install();
    let confirm!: (value: CheckoutStatus) => void;
    const verifyCheckout = vi.fn(
      () =>
        new Promise<CheckoutStatus>((resolve) => {
          confirm = resolve;
        }),
    );
    const onSuccess = vi.fn();
    const promise = handleCheckoutResult(checkout, {
      verifyCheckout,
      onSuccess,
      razorpayKeyId: 'wrong_old_key',
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(options.key).toBe('rzp_test_public');
    expect(options.order_id).toBe('order_stored');
    options.handler(callback);
    options.handler(callback);
    expect(verifyCheckout).toHaveBeenCalledExactlyOnceWith(
      'checkout-1',
      callback,
    );
    expect(onSuccess).not.toHaveBeenCalled();
    confirm(status);
    await promise;
    expect(onSuccess).toHaveBeenCalledExactlyOnceWith('pay_example');
  });

  it('does not treat a captured payment with pending fulfillment as complete', async () => {
    install();
    const onSuccess = vi.fn();
    const onProcessing = vi.fn();
    const promise = handleCheckoutResult(checkout, {
      verifyCheckout: vi
        .fn()
        .mockResolvedValue({ ...status, fulfillment_status: 'processing' }),
      onSuccess,
      onProcessing,
    });
    await Promise.resolve();
    await Promise.resolve();
    options.handler(callback);
    await promise;
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onProcessing).toHaveBeenCalled();
  });

  it('polls authorization through capture and fulfillment before succeeding', async () => {
    vi.useFakeTimers();
    install();
    const awaiting = {
      ...status,
      status: 'awaiting_payment' as const,
      fulfillment_status: 'pending' as const,
    };
    const getCheckoutStatus = vi
      .fn()
      .mockResolvedValueOnce(awaiting)
      .mockResolvedValueOnce({ ...status, fulfillment_status: 'processing' })
      .mockResolvedValue(status);
    const onSuccess = vi.fn();
    const onProcessing = vi.fn();
    const promise = handleCheckoutResult(checkout, {
      verifyCheckout: vi.fn().mockResolvedValue(awaiting),
      getCheckoutStatus,
      onSuccess,
      onProcessing,
    });
    await Promise.resolve();
    await Promise.resolve();
    options.handler(callback);
    await vi.advanceTimersByTimeAsync(2000);
    expect(onSuccess).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    await promise;
    expect(getCheckoutStatus).toHaveBeenCalledTimes(3);
    expect(onProcessing).toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledExactlyOnceWith('pay_example');
  });

  it('returns a prepared checkout so the buyer can open it', async () => {
    const getCheckoutStatus = vi.fn().mockResolvedValue({
      ...status,
      status: 'awaiting_payment',
      fulfillment_status: 'pending',
      checkout,
    });
    const result = await resumeCheckout(
      {
        type: 'processing',
        status: 'processing',
        checkout_id: checkout.checkout_id,
      },
      { getCheckoutStatus },
    );
    expect(result).toEqual(checkout);
    expect(getCheckoutStatus).toHaveBeenCalledOnce();
  });

  it('bounds confirmation polling while capture is still pending', async () => {
    vi.useFakeTimers();
    const awaiting = {
      ...status,
      status: 'awaiting_payment' as const,
      fulfillment_status: 'pending' as const,
    };
    const getCheckoutStatus = vi.fn().mockResolvedValue(awaiting);
    const promise = waitForCheckout(
      checkout.checkout_id,
      { getCheckoutStatus },
      awaiting,
    );
    await vi.advanceTimersByTimeAsync(30000);
    expect(await promise).toEqual(awaiting);
    expect(getCheckoutStatus).toHaveBeenCalledTimes(29);
  });

  it.each(['failed', 'expired', 'needs_review'] as const)(
    'stops confirmation on %s',
    async (terminal) => {
      vi.useFakeTimers();
      const getCheckoutStatus = vi
        .fn()
        .mockResolvedValue({ ...status, status: terminal });
      const promise = waitForCheckout(
        checkout.checkout_id,
        { getCheckoutStatus },
        {
          ...status,
          status: 'awaiting_payment',
          fulfillment_status: 'pending',
        },
      );
      const assertion = expect(promise).rejects.toThrow(
        'Checkout ' + terminal.replaceAll('_', ' '),
      );
      await vi.advanceTimersByTimeAsync(1000);
      await assertion;
      expect(getCheckoutStatus).toHaveBeenCalledOnce();
    },
  );

  it('does not verify or succeed when the checkout is dismissed', async () => {
    install();
    const verifyCheckout = vi.fn();
    const onDismiss = vi.fn();
    const promise = handleCheckoutResult(checkout, {
      verifyCheckout,
      onDismiss,
    });
    await Promise.resolve();
    await Promise.resolve();
    options.modal.ondismiss();
    await promise;
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(verifyCheckout).not.toHaveBeenCalled();
  });

  it('rejects mismatched authoritative status', async () => {
    install();
    const promise = handleCheckoutResult(checkout, {
      verifyCheckout: vi
        .fn()
        .mockResolvedValue({ ...status, checkout_id: 'another-customer' }),
    });
    await Promise.resolve();
    await Promise.resolve();
    options.handler(callback);
    await expect(promise).rejects.toThrow('did not match');
  });

  it('requires a backend verification callback before opening checkout', async () => {
    await expect(handleCheckoutResult(checkout, {})).rejects.toThrow(
      'verifyCheckout',
    );
  });

  it('waits for an existing script to load and shares that wait across callers', async () => {
    const script = document.createElement('script');
    script.id = 'razorpay-js';
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    document.body.appendChild(script);
    const loaded = vi.fn();
    const first = loadRazorpayScript().then(loaded);
    const second = loadRazorpayScript();
    await Promise.resolve();
    expect(loaded).not.toHaveBeenCalled();
    install();
    script.dispatchEvent(new Event('load'));
    await Promise.all([first, second]);
    expect(loaded).toHaveBeenCalledOnce();
  });
});
