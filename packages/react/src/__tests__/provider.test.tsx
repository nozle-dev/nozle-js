import React from 'react';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  BillingProvider,
  useBillingContext,
  useNozleClient,
  type CreateCheckout,
} from '../provider.js';

describe('BillingProvider', () => {
  it.each([undefined, 'https://custom.example/nested/engine///'])(
    'preserves the Engine prefix for catalog requests with base %s',
    async (baseUrl) => {
      const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <BillingProvider publishableKey="pk_browser" baseUrl={baseUrl}>
          {children}
        </BillingProvider>
      );
      const { result } = renderHook(() => useNozleClient(), { wrapper });

      await result.current.catalogFetch('/api/v1/plans?currency=USD');

      expect(fetchMock).toHaveBeenCalledWith(
        `${baseUrl?.replace(/\/+$/, '') ?? 'https://api.nozle.app/engine'}/api/v1/plans?currency=USD`,
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer pk_browser' }),
        }),
      );
    },
  );

  it('uses the publishable key only for catalog requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <BillingProvider publishableKey="pk_browser" baseUrl="https://api.example.test">
        {children}
      </BillingProvider>
    );

    const { result } = renderHook(() => useNozleClient(), { wrapper });
    await result.current.catalogFetch('/api/v1/plans');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/plans',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer pk_browser' }),
      }),
    );
  });

  it('rejects secret credentials in browser configuration', () => {
    expect(() =>
      renderHook(() => useBillingContext(), {
        wrapper: ({ children }) => (
          <BillingProvider publishableKey="sk_server">{children}</BillingProvider>
        ),
      }),
    ).toThrow('publishableKey must be a publishable key');
  });

  it('preserves merchant verification callbacks alongside the unified Engine default', async () => {
    const createCheckout: CreateCheckout = vi.fn();
    const verifyCheckout = vi.fn();
    const getCheckoutStatus = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <BillingProvider
        publishableKey="pk_browser"
        createCheckout={createCheckout}
        verifyCheckout={verifyCheckout}
        getCheckoutStatus={getCheckoutStatus}
      >
        {children}
      </BillingProvider>
    );

    const { result } = renderHook(() => useBillingContext(), { wrapper });
    expect(result.current.createCheckout).toBe(createCheckout);
    expect(result.current.verifyCheckout).toBe(verifyCheckout);
    expect(result.current.getCheckoutStatus).toBe(getCheckoutStatus);
    expect(result.current).not.toHaveProperty('customerId');
    await result.current.client.catalogFetch('/api/v1/plans');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.nozle.app/engine/api/v1/plans',
      expect.any(Object),
    );
  });
});
