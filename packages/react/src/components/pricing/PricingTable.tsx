'use client';

import React, { useState, useEffect, type CSSProperties } from 'react';
import {
  useOptionalBillingContext,
  type CheckoutResult,
} from '../../provider.js';
import { handleCheckoutResult } from '../billing/CheckoutButton.js';
import {
  intervalLabel,
  planFeatures,
  sortPlansByPrice,
  type CatalogCharge,
  type CatalogCreditGrantRule,
  type CatalogEntitlement,
} from './plan-features.js';
import { useAppearance, type UseAppearance } from '../../appearance/context.js';
import { PanelPlanCard } from './PanelPlanCard.js';
import { T, border, primaryButtonBorder, buttonStyle, type Appearance, type ButtonVariant } from '../../appearance/tokens.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PricingPlan {
  code: string;
  name: string;
  amount_cents: number;
  amount_currency: string;
  interval: string;
  description?: string;
  /** Present in the public catalog. The table turns these into each card's feature list. */
  entitlements?: CatalogEntitlement[];
  credit_grant_rules?: CatalogCreditGrantRule[];
  charges?: CatalogCharge[];
}

export interface PricingTableProps {
  currentPlanCode?: string;
  plans?: PricingPlan[];
  /**
   * Optional. By default each card lists what its plan gives, read from the catalog. Pass an array
   * (aligned to the rendered plan order) or an object keyed by plan code to replace the lines of
   * a plan.
   */
  features?: string[][] | Record<string, string[]>;
  /**
   * Optional. Orders the plans. By default they are sorted by base price, cheapest first, with
   * `contactSalesPlans` last.
   */
  sort?: (a: PricingPlan, b: PricingPlan) => number;
  onSelect?: (plan: PricingPlan) => void;
  returnUrl?: string;
  onStripeClientSecret?: (clientSecret: string) => void;
  onCheckoutResult?: (result: CheckoutResult) => void;
  onCheckoutError?: (error: Error) => void;
  showToggle?: boolean;
  /** Code of the plan to highlight. */
  highlightPlan?: string;
  /**
   * How the highlighted card stands out: `outline` (default) draws a border in `colorHighlight`;
   * `filled` paints the card in `colorHighlight` and its text and button in `colorHighlightForeground`.
   */
  highlightStyle?: 'outline' | 'filled';
  /** Badge on the highlighted card. Default "Most Popular"; pass `null` for no badge. */
  highlightLabel?: string | null;
  className?: string;
  /**
   * Codes of plans sold on request. Their card shows "Custom" instead of a price and a "Contact Sales"
   * button, which opens `enterpriseEmail` when set.
   */
  contactSalesPlans?: string[];
  enterpriseEmail?: string;
  appearance?: Appearance;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function featureLines(
  override: PricingTableProps['features'],
  plan: PricingPlan,
  index: number,
): string[] {
  const given = Array.isArray(override) ? override[index] : override?.[plan.code];
  return given ?? planFeatures(plan);
}

const SYMBOLS: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', JPY: '¥' };

function fmtPrice(cents: number, cur: string): string {
  const s = SYMBOLS[cur] ?? cur + ' ';
  const val = cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
  return `${s}${val}`;
}

// ─── Theme shortcuts ─────────────────────────────────────────────────────────

const C = {
  cardBg: T.card,
  hl: T.primary,
  border: T.border,
  radius: T.radius,
  text: T.foreground,
  muted: T.mutedForeground,
  mutedBg: T.muted,
  hlFg: T.primaryForeground,
};

// ─── Check icon ──────────────────────────────────────────────────────────────

function Check(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Toggle ──────────────────────────────────────────────────────────────────

function Toggle({ isAnnual, onChange, el }: { isAnnual: boolean; onChange: (v: boolean) => void; el: UseAppearance['el'] }) {
  const pill: CSSProperties = {
    display: 'inline-flex',
    borderRadius: '9999px',
    padding: '4px',
    background: C.mutedBg,
    gap: '2px',
  };
  const tab = (active: boolean): CSSProperties => ({
    padding: '8px 20px',
    borderRadius: '9999px',
    border: 'none',
    background: active ? C.cardBg : 'transparent',
    color: active ? C.text : C.muted,
    fontWeight: active ? 600 : 400,
    fontSize: '0.875rem',
    cursor: 'pointer',
    boxShadow: active ? T.shadow : 'none',
    transition: 'all 0.15s ease',
  });

  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2.5rem' }}>
      <div {...el('pricingTable__toggle', pill)}>
        <button onClick={() => onChange(false)} {...el('pricingTable__toggleButton', tab(!isAnnual))} aria-pressed={!isAnnual}>
          Monthly
        </button>
        <button onClick={() => onChange(true)} {...el('pricingTable__toggleButton', tab(isAnnual))} aria-pressed={isAnnual}>
          Annual
        </button>
      </div>
    </div>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────

interface CardProps {
  plan: PricingPlan;
  features?: string[];
  isCurrent: boolean;
  isHighlighted: boolean;
  filled: boolean;
  highlightLabel: string | null;
  isEnt: boolean;
  enterpriseEmail?: string;
  onSelect?: () => void;
  el: UseAppearance['el'];
  panel: boolean;
}

function Card({
  plan,
  features,
  isCurrent,
  isHighlighted,
  filled: filledStyle,
  highlightLabel,
  isEnt,
  enterpriseEmail,
  onSelect,
  el,
  panel,
}: CardProps): React.ReactElement {
  const [hover, setHover] = useState(false);
  // A filled highlight swaps the card's colours: highlight background, highlight-foreground text.
  const filled = isHighlighted && filledStyle;
  const text = filled ? T.highlightForeground : C.text;
  const muted = filled ? `color-mix(in srgb, ${T.highlightForeground} 75%, ${T.highlight})` : C.muted;
  const accent = filled ? T.highlightForeground : C.hl;
  const badgeLabel = isCurrent ? 'Current Plan' : highlightLabel;

  const interval = `/${intervalLabel(plan.interval)}`;

  const handleClick = () => {
    if (isCurrent) return;
    if (isEnt && enterpriseEmail) {
      window.location.href = `mailto:${enterpriseEmail}?subject=Enterprise Plan Inquiry`;
      return;
    }
    onSelect?.();
  };

  const cta = onSelect && (
    <CTAButton
      onClick={handleClick}
      disabled={isCurrent}
      variant={isCurrent ? 'current' : isEnt ? 'outline' : filled ? 'inverse' : isHighlighted ? 'highlight' : 'secondary'}
      el={el}
    >
      {isCurrent ? 'Current Plan' : isEnt ? 'Contact Sales' : `Get ${plan.name}`}
    </CTAButton>
  );

  if (panel) {
    return (
      <PanelPlanCard
        frame={(style) => el('planCard', style)}
        el={el}
        name={plan.name}
        description={plan.description}
        price={isEnt ? 'Custom' : fmtPrice(plan.amount_cents, plan.amount_currency)}
        interval={isEnt ? undefined : intervalLabel(plan.interval)}
        features={features ?? []}
        isCurrent={isCurrent}
        isHighlighted={isHighlighted}
        filled={filledStyle}
        highlightLabel={highlightLabel}
      >
        {cta}
      </PanelPlanCard>
    );
  }

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      {...el('planCard', {
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        background: filled ? T.highlight : C.cardBg,
        color: text,
        border: border(isHighlighted ? T.highlight : C.border),
        borderTopWidth: isHighlighted && !filled ? `calc(${T.borderWidth} + 2px)` : T.borderWidth,
        borderRadius: C.radius,
        padding: '2rem',
        transition: 'box-shadow 0.2s ease, transform 0.2s ease',
        boxShadow: T.shadow,
        transform: hover && !isCurrent ? 'translateY(-2px)' : 'none',
      })}
    >
      {/* Badge */}
      {isHighlighted && badgeLabel && (
        <div {...el('planCard__badge', {
          position: 'absolute',
          top: '-1px',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: filled ? T.highlightForeground : T.highlight,
          color: filled ? T.highlight : T.highlightForeground,
          border: filled ? border(T.highlight) : undefined,
          fontSize: '0.7rem',
          fontWeight: 700,
          padding: '4px 12px',
          borderRadius: '9999px',
          letterSpacing: '0.025em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        })}>
          {badgeLabel}
        </div>
      )}
      {isCurrent && !isHighlighted && (
        <div {...el('planCard__badge', {
          position: 'absolute',
          top: '0',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: C.mutedBg,
          color: C.muted,
          fontSize: '0.7rem',
          fontWeight: 700,
          padding: '4px 12px',
          borderRadius: '9999px',
          letterSpacing: '0.025em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        })}>
          Current Plan
        </div>
      )}

      {/* Plan name + description */}
      <div style={{ marginBottom: '1.25rem', marginTop: (isHighlighted && badgeLabel) || isCurrent ? '0.5rem' : 0 }}>
        <h3 {...el('planCard__name', {
          fontSize: '1.25rem',
          fontWeight: 700,
          color: text,
          margin: 0,
          lineHeight: 1.3,
        })}>
          {plan.name}
        </h3>
        {plan.description && (
          <p {...el('planCard__description', {
            fontSize: '0.875rem',
            color: muted,
            margin: '6px 0 0',
            lineHeight: 1.5,
          })}>
            {plan.description}
          </p>
        )}
      </div>

      {/* Price */}
      <div {...el('planCard__price', { marginBottom: '1.5rem' })}>
        {isEnt ? (
          <span style={{ fontSize: '2.25rem', fontWeight: 700, color: text, lineHeight: 1 }}>
            Custom
          </span>
        ) : (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px' }}>
            <span style={{ fontSize: '2.75rem', fontWeight: 700, color: text, lineHeight: 1, letterSpacing: '-0.025em' }}>
              {fmtPrice(plan.amount_cents, plan.amount_currency)}
            </span>
            <span style={{ fontSize: '0.9375rem', color: muted, marginLeft: '4px' }}>
              {interval}
            </span>
          </div>
        )}
      </div>

      {/* Features */}
      {features && features.length > 0 && (
        <ul {...el('planCard__features', {
          listStyle: 'none',
          padding: 0,
          margin: '0 0 2rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          flex: 1,
        })}>
          {features.map((feat) => (
            <li key={feat} {...el('planCard__feature', {
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              fontSize: '0.875rem',
              color: text,
              lineHeight: 1.5,
            })}>
              <span style={{ color: accent, marginTop: '2px' }}><Check /></span>
              <span>{feat}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Spacer if no features */}
      {(!features || features.length === 0) && <div style={{ flex: 1 }} />}

      {/* CTA */}
      {cta}
    </div>
  );
}

// ─── CTA Button ──────────────────────────────────────────────────────────────

function CTAButton({
  children,
  onClick,
  disabled,
  variant,
  el,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant: ButtonVariant | 'current' | 'highlight' | 'inverse';
  el: UseAppearance['el'];
}) {
  const [hover, setHover] = useState(false);
  const look =
    variant === 'current'
      ? { ...buttonStyle('secondary'), background: C.mutedBg, color: C.muted, cursor: 'default' }
      : variant === 'highlight'
        ? { ...buttonStyle('primary'), background: T.highlight, color: T.highlightForeground, border: primaryButtonBorder(T.highlight) }
        : variant === 'inverse'
          ? { ...buttonStyle('primary'), background: T.highlightForeground, color: T.highlight, border: primaryButtonBorder(T.highlightForeground) }
          : buttonStyle(variant);

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      {...el('planCard__cta', {
        ...look,
        width: '100%',
        filter: hover && !disabled ? 'brightness(0.95)' : undefined,
      })}
    >
      {children}
    </button>
  );
}

// ─── Loading skeleton ────────────────────────────────────────────────────────

function Skeleton({ rootProps }: { rootProps: ReturnType<UseAppearance['root']> }): React.ReactElement {
  return (
    <div {...rootProps} aria-busy="true" style={{ ...rootProps.style,
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
      gap: '1.5rem',
    }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{
          background: C.cardBg,
          border: border(),
          borderRadius: C.radius,
          padding: '2rem',
          height: '380px',
        }}>
          <div style={{ height: 20, width: '40%', borderRadius: 6, background: T.skeleton, marginBottom: 12 }} />
          <div style={{ height: 40, width: '50%', borderRadius: 6, background: T.skeleton, marginBottom: 24 }} />
          <div style={{ height: 14, width: '80%', borderRadius: 6, background: T.skeleton, marginBottom: 10 }} />
          <div style={{ height: 14, width: '70%', borderRadius: 6, background: T.skeleton, marginBottom: 10 }} />
          <div style={{ height: 14, width: '60%', borderRadius: 6, background: T.skeleton }} />
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function PricingTable({
  currentPlanCode,
  plans: propPlans,
  features,
  sort,
  onSelect,
  returnUrl,
  onStripeClientSecret,
  onCheckoutResult,
  onCheckoutError,
  showToggle = true,
  highlightPlan,
  highlightStyle = 'outline',
  highlightLabel = 'Most Popular',
  className,
  contactSalesPlans,
  enterpriseEmail,
  appearance,
}: PricingTableProps): React.ReactElement {
  const { root, el, planCardLayout } = useAppearance(appearance);
  const isEnterprise = (p: PricingPlan) => contactSalesPlans?.includes(p.code) ?? false;
  const billing = useOptionalBillingContext();
  const client = billing?.client;
  const [plans, setPlans] = useState<PricingPlan[]>(propPlans ?? []);
  const [currentPlan, setCurrentPlan] = useState<string | null>(currentPlanCode ?? null);
  const [isAnnual, setIsAnnual] = useState(false);
  const [loading, setLoading] = useState(!propPlans);
  const [processing, setProcessing] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    if (propPlans) { setPlans(propPlans); return; }
    if (!client) {
      setLoading(false);
      setCheckoutError('BillingProvider with a publishableKey is required to load plans');
      return;
    }
    let cancelled = false;
    client.catalogFetch('/api/v1/plans').then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!cancelled) setPlans(data.plans || []);
    }).catch((cause: unknown) => {
      if (!cancelled) setCheckoutError(`Plans could not be loaded: ${cause instanceof Error ? cause.message : 'unknown error'}`);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [client, propPlans]);

  useEffect(() => {
    if (currentPlanCode !== undefined) setCurrentPlan(currentPlanCode);
  }, [currentPlanCode]);

  async function selectPlan(plan: PricingPlan): Promise<void> {
    setCheckoutError(null);
    if (onSelect) {
      onSelect(plan);
      return;
    }
    try {
      if (!billing?.createCheckout) {
        throw new Error('BillingProvider createCheckout callback is required for checkout');
      }
      const result = await billing.createCheckout({
        planCode: plan.code,
        returnUrl: returnUrl ?? window.location.href,
      });
      onCheckoutResult?.(result);
      await handleCheckoutResult(result, {
        onStripeClientSecret,
        verifyCheckout: billing?.verifyCheckout,
        getCheckoutStatus: billing?.getCheckoutStatus,
        onProcessing: () => setProcessing(true),
        onSuccess: () => setProcessing(false),
        onComplete: () => setProcessing(false),
      });
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error('Checkout failed');
      setCheckoutError(error.message);
      onCheckoutError?.(error);
    }
  }

  const ordered = sort
    ? [...plans].sort(sort)
    : [...sortPlansByPrice(plans.filter((p) => !isEnterprise(p))), ...plans.filter(isEnterprise)];
  const hasAnnual = ordered.some(p => p.interval === 'yearly');
  const filtered = showToggle && hasAnnual
    ? ordered.filter(p => p.interval === (isAnnual ? 'yearly' : 'monthly') || isEnterprise(p))
    : ordered;

  const rootProps = root('pricingTable', { fontFamily: T.font, color: C.text }, className);
  if (loading) return <Skeleton rootProps={rootProps} />;

  return (
    <div {...rootProps}>
      {showToggle && hasAnnual && (
        <Toggle isAnnual={isAnnual} onChange={setIsAnnual} el={el} />
      )}

      {processing && <p role="status">Payment is processing. Confirmation may take a little while.</p>}
      {checkoutError && <p role="alert" style={{ color: T.danger }}>{checkoutError}</p>}

      <div {...el('pricingTable__grid', {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '1.5rem',
      })}>
        {filtered.map((plan, i) => (
          <Card
            key={plan.code}
            plan={plan}
            features={featureLines(features, plan, i)}
            isCurrent={currentPlan === plan.code}
            isHighlighted={highlightPlan === plan.code}
            filled={highlightStyle === 'filled'}
            highlightLabel={highlightLabel}
            isEnt={isEnterprise(plan)}
            enterpriseEmail={enterpriseEmail}
            onSelect={() => void selectPlan(plan)}
            el={el}
            panel={planCardLayout === 'panel'}
          />
        ))}
      </div>
    </div>
  );
}
