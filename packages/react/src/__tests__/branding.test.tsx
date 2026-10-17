import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BillingProvider, PlanComparison, PricingTable } from '../index.js';
import { NozleBranding } from '../components/branding/PoweredByNozle.js';

const plan = { code: 'pro', name: 'Pro', amount_cents: 2900, amount_currency: 'USD', interval: 'monthly' };

function catalog(meta: Record<string, unknown>) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ plans: [plan], meta }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const badge = () => screen.queryAllByRole('link', { name: /powered by/i });

afterEach(() => vi.unstubAllGlobals());

describe('Powered by Nozle', () => {
  it('shows the badge when the catalog says the Nozle plan keeps the branding', async () => {
    const fetchMock = catalog({ nozle_branding: true });
    render(
      <BillingProvider publishableKey="pk_test">
        <PricingTable showToggle={false} />
      </BillingProvider>,
    );

    expect(await screen.findByRole('link', { name: /powered by/i })).toHaveProperty('href', 'https://nozle.dev/');
    // The plans and the branding come from one catalog request.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([{ nozle_branding: false }, {}])('shows no badge for catalog meta %j', async (meta) => {
    catalog(meta);
    render(
      <BillingProvider publishableKey="pk_test">
        <PricingTable showToggle={false} />
      </BillingProvider>,
    );

    await screen.findByRole('heading', { name: 'Pro' });
    expect(badge()).toHaveLength(0);
  });

  it('shows no badge without a BillingProvider', () => {
    render(<PlanComparison plans={[plan]} />);
    expect(badge()).toHaveLength(0);
  });

  it('shows the badge once when a branded component renders another', async () => {
    catalog({ nozle_branding: true });
    render(
      <BillingProvider publishableKey="pk_test">
        <NozleBranding>
          <NozleBranding />
        </NozleBranding>
      </BillingProvider>,
    );

    await waitFor(() => expect(badge()).toHaveLength(1));
  });
});
