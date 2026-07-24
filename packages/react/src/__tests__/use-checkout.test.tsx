import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BillingProvider } from '../provider.js';
import { useCheckout } from '../hooks/use-checkout.js';

describe('useCheckout', () => {
  it('passes only planCode and returnUrl to the merchant callback', async () => {
    const createCheckout = vi.fn().mockResolvedValue({ type: 'stripe', client_secret: 'cs_test' });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <BillingProvider publishableKey="pk_browser" createCheckout={createCheckout}>
        {children}
      </BillingProvider>
    );
    const { result } = renderHook(() => useCheckout(), { wrapper });

    let secret: string | null = null;
    await act(async () => {
      secret = await result.current.fetchClientSecret('pro', 'https://merchant.example/complete');
    });

    expect(secret).toBe('cs_test');
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
      act(async () => result.current.fetchClientSecret('pro')),
    ).rejects.toThrow('createCheckout callback is required');
  });
});
