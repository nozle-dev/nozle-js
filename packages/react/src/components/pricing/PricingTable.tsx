'use client';

import React, { useState, useEffect, type CSSProperties } from 'react';
import {
  useOptionalBillingContext,
  type CheckoutResult,
} from '../../provider.js';
import { handleCheckoutResult } from '../billing/CheckoutButton.js';
import {
  getAvailableIntervals,
  getDefaultInterval,
  getPricingCards,
  getPricingIntervalOptions,
  resolvePricingLocale,
  yearlyMinor,
  type PricingCard,
  type PricingCatalog,
  type PricingFamily,
  type PricingFeatureOverrides,
  type PricingInterval,
  type PricingIntervalOption,
  type PricingPlan,
} from './catalog.js';
import { useAppearance, useSavedPricingTable, type UseAppearance } from '../../appearance/context.js';
import { PanelPlanCard } from './PanelPlanCard.js';
import { currentButtonStyle, planButtonState } from './button-state.js';
import { NozleBranding } from '../branding/PoweredByNozle.js';
import { useQuery } from '@tanstack/react-query';
import { catalogQuery, idleQueryClient } from '../../hooks/use-plans.js';
import { T, border, primaryButtonBorder, buttonStyle, text as role, type Appearance, type ButtonVariant } from '../../appearance/tokens.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export type {
  PricingCard,
  PricingCatalog,
  PricingEntitlement,
  PricingFamily,
  PricingFamilyFeature,
  PricingFeature,
  PricingFeatureOverrides,
  PricingInterval,
  PricingIntervalOption,
  PricingPlan,
  PricingPrivilege,
} from './catalog.js';

export interface PricingTableProps {
  currentPlanCode?: string;
  /** Plans to show instead of fetching the catalog. */
  plans?: PricingPlan[];
  /**
   * Plan families for `plans`. When omitted with `plans`, each plan is its
   * own card, as with older APIs.
   */
  families?: PricingFamily[] | null;
  /**
   * Optional. By default each card lists its family's features with values
   * from the selected plan, or, without families, what the plan gives. Pass
   * an object keyed by family code or plan code, or an array aligned to the
   * rendered cards, to replace the lines of a card.
   */
  features?: PricingFeatureOverrides;
  /**
   * Optional. Orders the plans of a catalog without families. By default
   * they are sorted by base price, cheapest first, with `contactSalesPlans`
   * last. Families are ordered by their `pricing_position`.
   */
  sort?: (a: PricingPlan, b: PricingPlan) => number;
  /** Called with the selected interval's plan and its family (null without families). */
  onSelect?: (plan: PricingPlan, family: PricingFamily | null) => void;
  returnUrl?: string;
  onCheckoutResult?: (result: CheckoutResult) => void;
  onCheckoutError?: (error: Error) => void;
  /** Show the interval switch when several intervals exist. Defaults to true. */
  showToggle?: boolean;
  /** Interval shown first ("annual" is accepted for "yearly"). Defaults to monthly when offered. */
  defaultInterval?: PricingInterval | 'annual';
  /** Family code or plan code to highlight. Overrides the family's `pricing_highlighted`. */
  highlightPlan?: string;
  /**
   * How the highlighted card stands out: `outline` (default) draws a border in `colorHighlight`;
   * `filled` paints the card in `colorHighlight` and its text and button in `colorHighlightForeground`.
   */
  highlightStyle?: 'outline' | 'filled';
  /**
   * Badge on the highlighted card. Replaces the family's `badge_text`; without either it is
   * "Most Popular". Pass `null` for no badge.
   */
  highlightLabel?: string | null;
  className?: string;
  /**
   * Codes of plans (or plan families) sold on request. Their card shows "Custom" instead of a price
   * and a "Contact Sales" button, which opens `enterpriseEmail` when set.
   */
  contactSalesPlans?: string[];
  enterpriseEmail?: string;
  /** Text next to the Annual option, replacing the computed "Save N%". */
  annualDiscountLabel?: string;
  /** Locale for prices and feature values. Defaults to `en-US`. */
  locale?: string;
  appearance?: Appearance;
}

// ─── Check icon ──────────────────────────────────────────────────────────────

function Check(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Interval switch ─────────────────────────────────────────────────────────

function IntervalSwitch({
  options,
  selected,
  onChange,
  annualDiscountLabel,
  el,
}: {
  options: PricingIntervalOption[];
  selected: PricingInterval;
  onChange: (interval: PricingInterval) => void;
  annualDiscountLabel?: string;
  el: UseAppearance['el'];
}) {
  const pill: CSSProperties = {
    display: 'inline-flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    borderRadius: '9999px',
    padding: '4px',
    background: T.muted,
    gap: '2px',
  };
  const tab = (active: boolean): CSSProperties => ({
    padding: '8px 20px',
    borderRadius: '9999px',
    border: 'none',
    background: active ? T.card : 'transparent',
    ...role.action,
    color: active ? T.foreground : T.mutedForeground,
    cursor: 'pointer',
    boxShadow: active ? T.shadow : 'none',
    transition: 'all 0.15s ease',
  });

  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2.5rem' }}>
      <div role="group" aria-label="Billing interval" {...el('pricingTable__toggle', pill)}>
        {options.map((option) => {
          const active = option.interval === selected;
          const note = option.interval === 'yearly' && annualDiscountLabel
            ? annualDiscountLabel
            : option.interval !== 'monthly' && option.savingsPercent !== null
            ? `Save ${option.savingsPercent}%`
            : null;
          return (
            <button
              key={option.interval}
              type="button"
              data-interval={option.interval}
              onClick={() => onChange(option.interval)}
              {...el('pricingTable__toggleButton', tab(active))}
              aria-pressed={active}
              aria-label={note ? `${option.label}, ${note.replace(/^Save /, 'save ')}` : undefined}
            >
              {option.label}
              {note && (
                <span style={{
                  marginLeft: '6px',
                  ...role.meta,
                  fontWeight: 600,
                  color: active ? T.primary : T.mutedForeground,
                }}>
                  {note}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────

interface CardProps {
  card: PricingCard;
  isCurrent: boolean;
  filled: boolean;
  enterpriseEmail?: string;
  onSelect?: () => void;
  el: UseAppearance['el'];
  panel: boolean;
  /** Costs more per year than the current plan; undefined when there is no current plan to compare with (every plan then gets the primary button). */
  isUpgrade?: boolean;
}

function Card({
  card,
  isCurrent,
  filled: filledStyle,
  enterpriseEmail,
  onSelect,
  el,
  panel,
  isUpgrade,
}: CardProps): React.ReactElement {
  const [hover, setHover] = useState(false);
  const { plan, features } = card;
  const isHighlighted = card.highlighted;
  const isEnt = card.enterprise;
  // A filled highlight swaps the card's colours: highlight background, highlight-foreground text.
  const filled = isHighlighted && filledStyle;
  const text = filled ? T.highlightForeground : T.foreground;
  const muted = filled ? `color-mix(in srgb, ${T.highlightForeground} 75%, ${T.highlight})` : T.mutedForeground;
  const accent = filled ? T.highlightForeground : T.primary;
  const badgeLabel = isCurrent ? 'Current Plan' : card.badge;

  const handleClick = () => {
    if (isCurrent) return;
    if (isEnt && enterpriseEmail) {
      window.location.href = `mailto:${enterpriseEmail}?subject=Enterprise Plan Inquiry`;
      return;
    }
    onSelect?.();
  };

  const ctaText = isCurrent
    ? 'Current Plan'
    : card.family?.cta_text?.trim()
    ? card.cta
    : isEnt
    ? 'Contact Sales'
    : card.cta;

  const state = planButtonState({ isCurrent, isUpgrade });
  const cta = onSelect && (
    <CTAButton
      onClick={handleClick}
      disabled={isCurrent}
      variant={
        state === 'current' ? 'current' : isEnt ? 'outline' : state === 'secondary' ? 'secondary' : filled ? 'inverse' : isHighlighted ? 'highlight' : 'primary'
      }
      el={el}
    >
      {ctaText}
    </CTAButton>
  );

  const dataAttributes = {
    'data-card-key': card.key,
    'data-family-code': card.family?.code,
    'data-plan-code': plan.code,
    'data-interval': plan.interval,
    'data-highlighted': isHighlighted ? 'true' : undefined,
  };

  if (panel) {
    return (
      <PanelPlanCard
        frame={(style) => ({ ...el('planCard', style), ...dataAttributes })}
        el={el}
        name={card.name}
        description={card.description}
        price={isEnt ? 'Custom' : card.price}
        interval={isEnt || !card.pricePeriod ? undefined : card.pricePeriod.replace(/^\//, '')}
        priceNote={isEnt ? null : card.billing}
        features={features}
        isCurrent={isCurrent}
        isHighlighted={isHighlighted}
        filled={filledStyle}
        highlightLabel={card.badge}
      >
        {cta}
      </PanelPlanCard>
    );
  }

  return (
    <div
      {...dataAttributes}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      {...el('planCard', {
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        background: filled ? T.highlight : T.card,
        color: text,
        border: border(isHighlighted ? T.highlight : T.border),
        borderTopWidth: isHighlighted && !filled ? `calc(${T.borderWidth} + 2px)` : T.borderWidth,
        borderRadius: T.radius,
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
          border: filled ? border(T.highlight) : undefined,
          ...role.label,
          color: filled ? T.highlight : T.highlightForeground,
          padding: '4px 12px',
          borderRadius: '9999px',
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
          background: T.muted,
          ...role.label,
          padding: '4px 12px',
          borderRadius: '9999px',
          whiteSpace: 'nowrap',
        })}>
          Current Plan
        </div>
      )}

      {/* Name + description */}
      <div style={{ marginBottom: '1.25rem', marginTop: (isHighlighted && badgeLabel) || isCurrent ? '0.5rem' : 0 }}>
        <h3 {...el('planCard__name', {
          ...role.heading,
          color: text,
          margin: 0,
        })}>
          {card.name}
        </h3>
        {card.description && (
          <p {...el('planCard__description', {
            ...role.secondary,
            color: muted,
            margin: '6px 0 0',
          })}>
            {card.description}
          </p>
        )}
      </div>

      {/* Price */}
      <div {...el('planCard__price', { marginBottom: '1.5rem' })}>
        {isEnt ? (
          <span style={{ ...role.metric, color: text }}>
            Custom
          </span>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px' }}>
              <span data-testid="pricing-price" style={{ ...role.metric, color: text }}>
                {card.price}
              </span>
              {card.pricePeriod && (
                <span style={{ ...role.meta, color: muted, marginLeft: '4px' }}>
                  {card.pricePeriod}
                </span>
              )}
            </div>
            {card.billing && (
              <p data-testid="pricing-billing" style={{ ...role.meta, color: muted, margin: '8px 0 0' }}>
                {card.billing}
              </p>
            )}
          </>
        )}
      </div>

      {/* Features */}
      {features.length > 0 && (
        <ul {...el('planCard__features', {
          listStyle: 'none',
          padding: 0,
          margin: '0 0 2rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          flex: 1,
        })}>
          {features.map((feat, index) => (
            <li key={`${index}:${feat.label}`} {...el('planCard__feature', {
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              ...role.body,
              color: text,
            })}>
              <span style={{ color: accent, marginTop: '2px' }}><Check /></span>
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <span>{feat.label}</span>
                {feat.description && (
                  <span style={{ ...role.meta, color: muted, marginTop: '2px' }}>
                    {feat.description}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Spacer if no features */}
      {features.length === 0 && <div style={{ flex: 1 }} />}

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
      ? currentButtonStyle
      : variant === 'highlight'
        ? { ...buttonStyle('primary'), background: T.highlight, color: T.highlightForeground, border: primaryButtonBorder(T.highlight) }
        : variant === 'inverse'
          ? { ...buttonStyle('primary'), background: T.highlightForeground, color: T.highlight, border: primaryButtonBorder(T.highlightForeground) }
          : buttonStyle(variant);

  return (
    <button type="button"
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
          background: T.card,
          border: border(),
          borderRadius: T.radius,
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
  families: propFamilies,
  features,
  sort,
  onSelect,
  returnUrl,
  onCheckoutResult,
  onCheckoutError,
  showToggle: showToggleProp,
  defaultInterval,
  highlightPlan,
  highlightStyle: highlightStyleProp,
  highlightLabel: highlightLabelProp,
  className,
  contactSalesPlans,
  enterpriseEmail,
  annualDiscountLabel: annualDiscountLabelProp,
  locale: localeProp,
  appearance,
}: PricingTableProps): React.ReactElement {
  const { root, el, planCardLayout } = useAppearance(appearance, 'PricingTable');
  // Options saved in the dashboard are the defaults; props win.
  const saved = useSavedPricingTable('PricingTable');
  const showToggle = showToggleProp ?? saved?.showToggle ?? true;
  const highlightStyle = highlightStyleProp ?? saved?.highlightStyle ?? 'outline';
  const highlightLabel = highlightLabelProp !== undefined ? highlightLabelProp : saved?.highlightLabel === '' ? null : saved?.highlightLabel;
  const annualDiscountLabel = annualDiscountLabelProp ?? saved?.annualDiscountLabel;
  // A malformed tag (e.g. "en_US") falls back to en-US instead of throwing
  // during render or turning every price into "Amount unavailable".
  const locale = resolvePricingLocale(localeProp);
  const billing = useOptionalBillingContext();
  const client = billing?.client;
  // One cached catalog request, shared with usePlans and the "Powered by Nozle" check.
  const fetched = useQuery(
    { ...catalogQuery(client), enabled: !propPlans && Boolean(client) },
    billing?.queryClient ?? idleQueryClient,
  );
  const catalog: PricingCatalog = propPlans
    ? { plans: propPlans, families: Array.isArray(propFamilies) ? propFamilies : null }
    : { plans: fetched.data?.plans ?? [], families: fetched.data?.families ?? null };
  const loading = !propPlans && Boolean(client) && fetched.isPending;
  const loadError = propPlans
    ? null
    : !client
      ? 'BillingProvider with a publishableKey is required to load plans'
      : fetched.error
        ? `Plans could not be loaded: ${fetched.error.message}`
        : null;
  const [currentPlan, setCurrentPlan] = useState<string | null>(currentPlanCode ?? null);
  const [selectedInterval, setSelectedInterval] = useState<PricingInterval | null>(null);
  const [processing, setProcessing] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    if (currentPlanCode !== undefined) setCurrentPlan(currentPlanCode);
  }, [currentPlanCode]);

  const withFamilies = Array.isArray(catalog.families);

  async function selectPlan(plan: PricingPlan, family: PricingFamily | null): Promise<void> {
    setCheckoutError(null);
    if (onSelect) {
      onSelect(plan, family);
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

  const available = getAvailableIntervals(catalog);
  const interval = selectedInterval !== null && available.includes(selectedInterval)
    ? selectedInterval
    : getDefaultInterval(catalog, defaultInterval);
  const switchVisible = showToggle && available.length > 1 && interval !== null;
  // Without families the switch filters plans by interval, as before; with
  // the switch hidden every plan is shown.
  const cards = getPricingCards(catalog, {
    interval: withFamilies || switchVisible ? interval : null,
    locale,
    highlight: highlightPlan,
    badge: highlightLabel,
    features,
    contactSales: contactSalesPlans,
    sort,
  });
  // Plans of different intervals are compared by their cost over a year.
  const current = catalog.plans.find((p) => p.code === currentPlan);
  const currentYearly = current ? yearlyMinor(current) : null;
  const isUpgrade = (plan: PricingPlan): boolean | undefined => {
    if (!current || current.amount_currency !== plan.amount_currency) return undefined;
    const yearly = yearlyMinor(plan);
    return currentYearly !== null && yearly !== null
      ? yearly > currentYearly
      : plan.amount_cents > current.amount_cents;
  };

  const rootProps = root('pricingTable', role.body, className);
  if (loading) return <Skeleton rootProps={rootProps} />;

  return (
    <div {...rootProps}>
      {switchVisible && interval !== null && (
        <IntervalSwitch
          options={getPricingIntervalOptions(catalog)}
          selected={interval}
          onChange={setSelectedInterval}
          annualDiscountLabel={annualDiscountLabel}
          el={el}
        />
      )}

      {processing && <p role="status">Payment is processing. Confirmation may take a little while.</p>}
      {(checkoutError ?? loadError) && <p role="alert" style={{ color: T.dangerText }}>{checkoutError ?? loadError}</p>}

      <div {...el('pricingTable__grid', {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '1.5rem',
      })}>
        {cards.map((card) => (
          <Card
            key={card.key}
            card={card}
            isCurrent={currentPlan === card.plan.code}
            isUpgrade={isUpgrade(card.plan)}
            filled={highlightStyle === 'filled'}
            enterpriseEmail={enterpriseEmail}
            onSelect={() => void selectPlan(card.plan, card.family)}
            el={el}
            panel={planCardLayout === 'panel'}
          />
        ))}
      </div>
      <NozleBranding />
    </div>
  );
}
