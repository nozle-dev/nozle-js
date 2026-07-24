import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BillingProvider } from '../provider.js';
import { CheckoutButton } from '../components/billing/CheckoutButton.js';
import { UpgradeButton } from '../components/billing/UpgradeButton.js';
import { PricingTable } from '../components/pricing/PricingTable.js';
import { PlanCard } from '../components/pricing/PlanCard.js';

const plans = [
  {
    code: 'pro',
    name: 'Pro',
    amount_cents: 5000,
    amount_currency: 'USD',
    interval: 'monthly',
  },
];

describe('merchant checkout components', () => {
  it('forwards returnUrl from CheckoutButton and never supplies customer identity', async () => {
    const createCheckout = vi.fn().mockResolvedValue({ type: 'completed', status: 'succeeded' });
    const onComplete = vi.fn();
    render(
      <BillingProvider publishableKey="pk_browser" createCheckout={createCheckout}>
        <CheckoutButton
          planCode="pro"
          returnUrl="https://merchant.example/complete"
          onComplete={onComplete}
        />
      </BillingProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Get Started' }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
    expect(createCheckout).toHaveBeenCalledWith({
      planCode: 'pro',
      returnUrl: 'https://merchant.example/complete',
    });
    expect(createCheckout.mock.calls[0][0]).not.toHaveProperty('customerId');
  });

  it('shows a clear error when CheckoutButton has no merchant callback', async () => {
    render(
      <BillingProvider publishableKey="pk_browser">
        <CheckoutButton planCode="pro" />
      </BillingProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Get Started' }));
    expect(
      await screen.findByText('BillingProvider createCheckout callback is required for checkout'),
    ).toBeTruthy();
  });

  it('forwards returnUrl through UpgradeButton and UpgradeModal', async () => {
    const createCheckout = vi.fn().mockResolvedValue({ type: 'scheduled', status: 'pending' });
    const onScheduled = vi.fn();
    render(
      <BillingProvider publishableKey="pk_browser" createCheckout={createCheckout}>
        <UpgradeButton
          planCode="starter"
          returnUrl="https://merchant.example/scheduled"
          onDowngradeScheduled={onScheduled}
        />
      </BillingProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Upgrade' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(onScheduled).toHaveBeenCalledOnce());
    expect(createCheckout).toHaveBeenCalledWith({
      planCode: 'starter',
      returnUrl: 'https://merchant.example/scheduled',
    });
  });

  it('uses the provider callback from PricingTable', async () => {
    const createCheckout = vi.fn().mockResolvedValue({ type: 'completed', status: 'succeeded' });
    render(
      <BillingProvider publishableKey="pk_browser" createCheckout={createCheckout}>
        <PricingTable plans={plans} returnUrl="https://merchant.example/pricing" showToggle={false} />
      </BillingProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Get Pro' }));
    await waitFor(() => expect(createCheckout).toHaveBeenCalledOnce());
    expect(createCheckout).toHaveBeenCalledWith({
      planCode: 'pro',
      returnUrl: 'https://merchant.example/pricing',
    });
  });

  it('forwards plan and return URL from PlanCard without customer data', () => {
    const onSelect = vi.fn();
    render(
      <PlanCard
        id="pro"
        name="Pro"
        monthlyPrice={50}
        annualPrice={500}
        features={[]}
        isAnnual={false}
        isCurrent={false}
        returnUrl="https://merchant.example/card"
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Select Pro' }));
    expect(onSelect).toHaveBeenCalledWith({
      planCode: 'pro',
      returnUrl: 'https://merchant.example/card',
    });
  });
});
