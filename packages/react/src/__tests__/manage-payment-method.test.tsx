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

  it('surfaces the razorpay_pays_by_link error without opening anything', async () => {
    const createManagePaymentMethod = vi.fn().mockRejectedValue(new Error('razorpay_pays_by_link'));
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <BillingProvider publishableKey="pk_browser" createManagePaymentMethod={createManagePaymentMethod}>
        {children}
      </BillingProvider>
    );
    const { result } = renderHook(() => useManagePaymentMethod(), { wrapper });
    let thrown: unknown;
    await act(async () => {
      await result.current.managePaymentMethod().catch((cause: unknown) => (thrown = cause));
    });
    expect((thrown as Error).message).toBe('razorpay_pays_by_link');
    expect(result.current.error?.message).toBe('razorpay_pays_by_link');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('fails clearly without the callback or a usable result', async () => {
    const missing = setup(undefined);
    await expect(act(async () => missing.result.current.managePaymentMethod())).rejects.toThrow(
      'createManagePaymentMethod callback is required',
    );
    const empty = setup({ url: '', expires_at: null, provider: 'stripe' });
    await expect(act(async () => empty.result.current.managePaymentMethod())).rejects.toThrow(
      'did not include a URL',
    );
  });
});
