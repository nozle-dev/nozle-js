import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BillingProvider } from '../provider.js';
import { useCheckout } from '../hooks/use-checkout.js';

describe('useCheckout', () => {
  it('passes only planCode and returnUrl to the merchant callback and redirects a hosted result', async () => {
    const createCheckout = vi.fn().mockResolvedValue({ type: 'hosted', url: 'https://checkout.stripe.com/c/pay/cs_test' });
    const assign = vi.fn();
    vi.stubGlobal('location', { assign, href: 'https://merchant.example/billing' });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <BillingProvider publishableKey="pk_browser" createCheckout={createCheckout}>
        {children}
      </BillingProvider>
    );
    const { result } = renderHook(() => useCheckout(), { wrapper });

    await act(async () => {
      await result.current.startCheckout('pro', 'https://merchant.example/complete');
    });

    expect(assign).toHaveBeenCalledExactlyOnceWith('https://checkout.stripe.com/c/pay/cs_test');
    vi.unstubAllGlobals();
    expect(createCheckout).toHaveBeenCalledWith({
      planCode: 'pro',
      returnUrl: 'https://merchant.example/complete',
    });
    expect(createCheckout.mock.calls[0][0]).not.toHaveProperty('customerId');
  });

  it('returns a clear error when the callback is missing', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <BillingProvider publishableKey="pk_browser">{children}</BillingProvider>
    );
    const { result } = renderHook(() => useCheckout(), { wrapper });

    await expect(
      act(async () => result.current.startCheckout('pro')),
    ).rejects.toThrow('createCheckout callback is required');
  });
});
