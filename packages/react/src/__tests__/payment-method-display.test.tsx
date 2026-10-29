import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BillingProvider } from '../provider.js';
import { PaymentMethodDisplay } from '../components/billing/PaymentMethodDisplay.js';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('../components/billing/checkout-navigation.js', () => ({ navigateToCheckout: navigate }));

const originalLocation = window.location;

afterEach(() => {
  cleanup();
  navigate.mockReset();
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
});

function stubLocation() {
  const location = { href: 'https://app.example/billing' };
  Object.defineProperty(window, 'location', { configurable: true, value: location });
  return location;
}

const clickUpdate = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Update Payment Method' }));

describe('PaymentMethodDisplay update button', () => {
  it('calls onUpdatePaymentMethod first, even inside a provider with the card flow', () => {
    const update = vi.fn();
    const createManagePaymentMethod = vi.fn();
    render(
      <BillingProvider publishableKey="pk_browser" createManagePaymentMethod={createManagePaymentMethod}>
        <PaymentMethodDisplay onUpdatePaymentMethod={update} />
      </BillingProvider>,
    );
    clickUpdate();
    expect(update).toHaveBeenCalledOnce();
    expect(createManagePaymentMethod).not.toHaveBeenCalled();
  });

  it('opens the card page through createManagePaymentMethod inside a BillingProvider', async () => {
    const location = stubLocation();
    const createManagePaymentMethod = vi
      .fn()
      .mockResolvedValue({ url: 'https://pay.example/card', expires_at: null, provider: 'stripe' });
    render(
      <BillingProvider publishableKey="pk_browser" createManagePaymentMethod={createManagePaymentMethod}>
        <PaymentMethodDisplay />
      </BillingProvider>,
    );
    clickUpdate();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('https://pay.example/card'));
    expect(createManagePaymentMethod).toHaveBeenCalledWith({ returnUrl: 'https://app.example/billing' });
    expect(location.href).toBe('https://app.example/billing');
  });

  it('shows the card flow error and stays on the page', async () => {
    const createManagePaymentMethod = vi.fn().mockRejectedValue(new Error('card_page_unavailable'));
    render(
      <BillingProvider publishableKey="pk_browser" createManagePaymentMethod={createManagePaymentMethod}>
        <PaymentMethodDisplay />
      </BillingProvider>,
    );
    clickUpdate();
    expect((await screen.findByRole('alert')).textContent).toBe('card_page_unavailable');
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Update Payment Method' })).toHaveProperty('disabled', false);
  });

  it('navigates to updateHref outside a BillingProvider and without the callback', () => {
    let location = stubLocation();
    render(<PaymentMethodDisplay />);
    clickUpdate();
    expect(location.href).toBe('/billing/update-payment');
    cleanup();

    location = stubLocation();
    render(
      <BillingProvider publishableKey="pk_browser">
        <PaymentMethodDisplay updateHref="/settings/card" />
      </BillingProvider>,
    );
    clickUpdate();
    expect(location.href).toBe('/settings/card');
    expect(navigate).not.toHaveBeenCalled();
  });
});
