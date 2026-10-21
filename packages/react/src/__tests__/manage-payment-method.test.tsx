import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BillingProvider, type ManagePaymentMethodResult } from '../provider.js';
import { useManagePaymentMethod } from '../hooks/use-manage-payment-method.js';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('../components/billing/checkout-navigation.js', () => ({ navigateToCheckout: navigate }));

function setup(
  result: ManagePaymentMethodResult | undefined,
  extra: Record<string, unknown> = {},
) {
  const createManagePaymentMethod = result ? vi.fn().mockResolvedValue(result) : undefined;
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <BillingProvider
      publishableKey="pk_browser"
      createManagePaymentMethod={createManagePaymentMethod}
      {...extra}
    >
      {children}
    </BillingProvider>
  );
  return { createManagePaymentMethod, ...renderHook(() => useManagePaymentMethod(), { wrapper }) };
}

afterEach(() => {
  delete window.Razorpay;
  navigate.mockReset();
});

describe('useManagePaymentMethod', () => {
  it('redirects to the Stripe billing page', async () => {
    const { result, createManagePaymentMethod } = setup({
      url: 'https://billing.stripe.com/x',
      expires_at: null,
      provider: 'stripe',
    });
    await act(async () => result.current.managePaymentMethod('https://app.example/back'));
    expect(createManagePaymentMethod).toHaveBeenCalledWith({ returnUrl: 'https://app.example/back' });
    expect(navigate).toHaveBeenCalledWith('https://billing.stripe.com/x');
  });

  it('opens Razorpay Checkout from the checkout options when url is null', async () => {
    let options: { key: string; order_id: string } | undefined;
    window.Razorpay = class {
      constructor(value: NonNullable<typeof options>) {
        options = value;
      }
      open() {}
      close() {}
      on() {}
    } as typeof window.Razorpay;
    const { result } = setup(
      {
        url: null,
        expires_at: '2026-10-22T10:00:00Z',
        provider: 'razorpay',
        checkout: {
          type: 'razorpay',
          checkout_id: 'c1',
          key_id: 'rzp_test_public',
          order_id: 'o1',
          amount_cents: 100,
          currency: 'INR',
        },
      },
      { verifyCheckout: vi.fn() },
    );
    const onDismiss = vi.fn();
    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = result.current.managePaymentMethod(undefined, { onDismiss });
      await vi.waitFor(() => expect(options).toBeDefined());
    });
    expect(options).toMatchObject({ key: 'rzp_test_public', order_id: 'o1' });
    expect(navigate).not.toHaveBeenCalled();
    (options as unknown as { modal: { ondismiss: () => void } }).modal.ondismiss();
    await pending;
    expect(onDismiss).toHaveBeenCalled();
  });

  it('fails clearly without the callback or a usable result', async () => {
    const missing = setup(undefined);
    await expect(act(async () => missing.result.current.managePaymentMethod())).rejects.toThrow(
      'createManagePaymentMethod callback is required',
    );
    const empty = setup({ url: null, expires_at: null, provider: 'stripe' });
    await expect(act(async () => empty.result.current.managePaymentMethod())).rejects.toThrow(
      'did not include a URL or checkout',
    );
  });
});
