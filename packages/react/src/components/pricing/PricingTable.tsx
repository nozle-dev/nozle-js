'use client';

import React, { useState, useEffect, type CSSProperties } from 'react';
import { useNozleClient } from '../../provider.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PricingPlan {
  code: string;
  name: string;
  amount_cents: number;
  amount_currency: string;
  interval: string;
  description?: string;
}

export interface PricingTableProps {
  customerId?: string;
  currentPlanCode?: string;
  plans?: PricingPlan[];
  features?: string[][];
  onSelect?: (plan: PricingPlan) => void;
  showToggle?: boolean;
  highlightPlan?: string;
  className?: string;
  enterpriseEmail?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SYMBOLS: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', JPY: '¥' };

function fmtPrice(cents: number, cur: string): string {
  const s = SYMBOLS[cur] ?? cur + ' ';
  const val = cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
  return `${s}${val}`;
}

function isEnterprise(p: PricingPlan): boolean {
  return /enterprise|custom/i.test(p.name + p.code);
}

function v(name: string, fb: string): string {
  return `var(${name}, ${fb})`;
}

// ─── CSS variable shortcuts ──────────────────────────────────────────────────

const C = {
  bg:       v('--nozle-pricing-bg', v('--nozle-background', '#ffffff')),
  cardBg:   v('--nozle-pricing-card-bg', v('--nozle-card', '#ffffff')),
  hl:       v('--nozle-pricing-highlight', v('--nozle-primary', '#6366f1')),
  border:   v('--nozle-pricing-border', v('--nozle-border', '#e5e7eb')),
  radius:   v('--nozle-pricing-radius', v('--nozle-radius', '12px')),
  text:     v('--nozle-foreground', '#111827'),
  muted:    v('--nozle-muted-foreground', '#6b7280'),
  mutedBg:  v('--nozle-muted', '#f3f4f6'),
  hlFg:     v('--nozle-primary-foreground', '#ffffff'),
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

function Toggle({ isAnnual, onChange }: { isAnnual: boolean; onChange: (v: boolean) => void }) {
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
    boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
    transition: 'all 0.15s ease',
  });

  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2.5rem' }}>
      <div style={pill}>
        <button onClick={() => onChange(false)} style={tab(!isAnnual)} aria-pressed={!isAnnual}>
          Monthly
        </button>
        <button onClick={() => onChange(true)} style={tab(isAnnual)} aria-pressed={isAnnual}>
          Annual
          <span style={{
            marginLeft: '6px',
            fontSize: '0.7rem',
            fontWeight: 600,
            color: isAnnual ? C.hl : C.muted,
          }}>
            Save 20%
          </span>
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
  isEnt: boolean;
  enterpriseEmail?: string;
  onSelect?: () => void;
}

function Card({
  plan,
  features,
  isCurrent,
  isHighlighted,
  isEnt,
  enterpriseEmail,
  onSelect,
}: CardProps): React.ReactElement {
  const [hover, setHover] = useState(false);

  const shadow = isHighlighted
    ? '0 8px 28px rgba(99,102,241,0.12), 0 2px 8px rgba(99,102,241,0.06)'
    : hover
    ? '0 8px 24px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.03)'
    : '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03)';

  const interval = plan.interval === 'yearly' ? '/year' : '/month';

  const handleClick = () => {
    if (isCurrent) return;
    if (isEnt && enterpriseEmail) {
      window.location.href = `mailto:${enterpriseEmail}?subject=Enterprise Plan Inquiry`;
      return;
    }
    onSelect?.();
  };

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        background: C.cardBg,
        border: `1px solid ${isHighlighted ? C.hl : C.border}`,
        borderTopWidth: isHighlighted ? '3px' : '1px',
        borderRadius: C.radius,
        padding: '2rem',
        transition: 'box-shadow 0.2s ease, transform 0.2s ease',
        boxShadow: shadow,
        transform: hover && !isCurrent ? 'translateY(-2px)' : 'none',
      }}
    >
      {/* Badge */}
      {isHighlighted && (
        <div style={{
          position: 'absolute',
          top: '-1px',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: C.hl,
          color: C.hlFg,
          fontSize: '0.7rem',
          fontWeight: 700,
          padding: '4px 12px',
          borderRadius: '9999px',
          letterSpacing: '0.025em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}>
          {isCurrent ? 'Current Plan' : 'Most Popular'}
        </div>
      )}
      {isCurrent && !isHighlighted && (
        <div style={{
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
        }}>
          Current Plan
        </div>
      )}

      {/* Plan name + description */}
      <div style={{ marginBottom: '1.25rem', marginTop: isHighlighted || isCurrent ? '0.5rem' : 0 }}>
        <h3 style={{
          fontSize: '1.25rem',
          fontWeight: 700,
          color: C.text,
          margin: 0,
          lineHeight: 1.3,
        }}>
          {plan.name}
        </h3>
        {plan.description && (
          <p style={{
            fontSize: '0.875rem',
            color: C.muted,
            margin: '6px 0 0',
            lineHeight: 1.5,
          }}>
            {plan.description}
          </p>
        )}
      </div>

      {/* Price */}
      <div style={{ marginBottom: '1.5rem' }}>
        {isEnt ? (
          <span style={{ fontSize: '2.25rem', fontWeight: 700, color: C.text, lineHeight: 1 }}>
            Custom
          </span>
        ) : (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px' }}>
            <span style={{ fontSize: '2.75rem', fontWeight: 700, color: C.text, lineHeight: 1, letterSpacing: '-0.025em' }}>
              {fmtPrice(plan.amount_cents, plan.amount_currency)}
            </span>
            <span style={{ fontSize: '0.9375rem', color: C.muted, marginLeft: '4px' }}>
              {interval}
            </span>
          </div>
        )}
      </div>

      {/* Features */}
      {features && features.length > 0 && (
        <ul style={{
          listStyle: 'none',
          padding: 0,
          margin: '0 0 2rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          flex: 1,
        }}>
          {features.map((feat) => (
            <li key={feat} style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              fontSize: '0.875rem',
              color: C.text,
              lineHeight: 1.5,
            }}>
              <span style={{ color: C.hl, marginTop: '2px' }}><Check /></span>
              <span>{feat}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Spacer if no features */}
      {(!features || features.length === 0) && <div style={{ flex: 1 }} />}

      {/* CTA */}
      {onSelect && (
        <CTAButton
          onClick={handleClick}
          disabled={isCurrent}
          variant={isCurrent ? 'current' : isEnt ? 'outline' : isHighlighted ? 'primary' : 'secondary'}
        >
          {isCurrent ? 'Current Plan' : isEnt ? 'Contact Sales' : `Get ${plan.name}`}
        </CTAButton>
      )}
    </div>
  );
}

// ─── CTA Button ──────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'current';

function CTAButton({
  children,
  onClick,
  disabled,
  variant,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant: ButtonVariant;
}) {
  const [hover, setHover] = useState(false);

  const base: CSSProperties = {
    width: '100%',
    padding: '12px 24px',
    borderRadius: '10px',
    fontSize: '0.9375rem',
    fontWeight: 600,
    cursor: disabled ? 'default' : 'pointer',
    border: 'none',
    transition: 'all 0.15s ease',
    lineHeight: 1.4,
  };

  const variants: Record<ButtonVariant, CSSProperties> = {
    primary: {
      background: hover && !disabled ? '#4f46e5' : C.hl,
      color: C.hlFg,
    },
    secondary: {
      background: hover && !disabled ? '#f0f0f3' : C.mutedBg,
      color: C.text,
      border: `1px solid ${C.border}`,
    },
    outline: {
      background: hover && !disabled ? 'rgba(99,102,241,0.04)' : 'transparent',
      color: C.hl,
      border: `1.5px solid ${C.hl}`,
    },
    current: {
      background: C.mutedBg,
      color: C.muted,
    },
  };

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...base, ...variants[variant] }}
    >
      {children}
    </button>
  );
}

// ─── Loading skeleton ────────────────────────────────────────────────────────

function Skeleton(): React.ReactElement {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
      gap: '1.5rem',
    }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{
          background: C.cardBg,
          border: `1px solid ${C.border}`,
          borderRadius: C.radius,
          padding: '2rem',
          height: '380px',
        }}>
          <div style={{ height: 20, width: '40%', borderRadius: 6, background: '#f0f0f0', marginBottom: 12 }} />
          <div style={{ height: 40, width: '50%', borderRadius: 6, background: '#f0f0f0', marginBottom: 24 }} />
          <div style={{ height: 14, width: '80%', borderRadius: 6, background: '#f0f0f0', marginBottom: 10 }} />
          <div style={{ height: 14, width: '70%', borderRadius: 6, background: '#f0f0f0', marginBottom: 10 }} />
          <div style={{ height: 14, width: '60%', borderRadius: 6, background: '#f0f0f0' }} />
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function PricingTable({
  customerId,
  currentPlanCode,
  plans: propPlans,
  features,
  onSelect,
  showToggle = true,
  highlightPlan,
  className,
  enterpriseEmail,
}: PricingTableProps): React.ReactElement {
  const client = useNozleClient();
  const [plans, setPlans] = useState<PricingPlan[]>(propPlans ?? []);
  const [currentPlan, setCurrentPlan] = useState<string | null>(currentPlanCode ?? null);
  const [isAnnual, setIsAnnual] = useState(false);
  const [loading, setLoading] = useState(!propPlans);

  useEffect(() => {
    if (propPlans) { setPlans(propPlans); return; }
    let cancelled = false;
    client.fetch('/api/v1/plans').then(async (res) => {
      if (!cancelled && res.ok) {
        const data = await res.json();
        setPlans(data.plans || []);
      }
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [client, propPlans]);

  useEffect(() => {
    if (currentPlanCode !== undefined) {
      setCurrentPlan(currentPlanCode);
      return;
    }
    if (!customerId) return;
    let cancelled = false;
    client.fetch(`/api/v1/billing/status?customer_id=${encodeURIComponent(customerId)}`)
      .then(async (res) => {
        if (!cancelled && res.ok) {
          const data = await res.json();
          setCurrentPlan(data.plan ?? data.planName ?? null);
        }
      }).catch(() => {});
    return () => { cancelled = true; };
  }, [client, customerId, currentPlanCode]);

  const hasAnnual = plans.some(p => p.interval === 'yearly');
  const filtered = showToggle && hasAnnual
    ? plans.filter(p => p.interval === (isAnnual ? 'yearly' : 'monthly') || isEnterprise(p))
    : plans;

  if (loading) return <Skeleton />;

  return (
    <div className={className} style={{
      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      color: C.text,
      background: C.bg,
    }}>
      {showToggle && hasAnnual && (
        <Toggle isAnnual={isAnnual} onChange={setIsAnnual} />
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '1.5rem',
      }}>
        {filtered.map((plan, i) => (
          <Card
            key={plan.code}
            plan={plan}
            features={features?.[i]}
            isCurrent={currentPlan === plan.code}
            isHighlighted={highlightPlan === plan.code}
            isEnt={isEnterprise(plan)}
            enterpriseEmail={enterpriseEmail}
            onSelect={onSelect ? () => onSelect(plan) : undefined}
          />
        ))}
      </div>
    </div>
  );
}
