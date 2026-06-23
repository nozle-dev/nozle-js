export interface OnboardingChargeConfig {
  billableMetricCode: string
  chargeModel: 'standard' | 'graduated' | 'package'
  properties: Record<string, unknown>
}

export interface OnboardingCostModel {
  name: string
  metricCode: string
  costType: 'per_unit' | 'per_model' | 'tiered'
  amountCents?: number
  modelRates?: Record<string, { input: number; output: number }>
  tiers?: Array<{ up_to: number | null; unit_amount_cents: number; flat_amount_cents: number }>
}

export interface OnboardingFeature {
  name: string
  code: string
  billableMetricCode?: string
  description?: string
}

export interface OnboardingBillableMetric {
  name: string
  code: string
  aggregationType: 'sum_agg' | 'count_agg' | 'max_agg'
  fieldName?: string
}

export interface OnboardingPlan {
  name: string
  code: string
  interval: 'monthly' | 'yearly'
  amountCents: number
  currency: 'USD'
  charges: OnboardingChargeConfig[]
}

export interface OnboardingConfig {
  billableMetrics: OnboardingBillableMetric[]
  plans: OnboardingPlan[]
  costModels: OnboardingCostModel[]
  features?: OnboardingFeature[]
}

// Backward compat — old configs may have singular "plan"
export function normalizePlans(config: OnboardingConfig & { plan?: OnboardingPlan }): OnboardingConfig {
  if (config.plans?.length) return config
  if (config.plan) return { ...config, plans: [config.plan] }
  return config
}

export interface OnboardingTemplate {
  id: string
  title: string
  subtitle: string
  description: string
  priceLabel: string
  icon: string
  config: OnboardingConfig
}

export const ONBOARDING_TEMPLATES: OnboardingTemplate[] = [
  {
    id: 'flat-subscription',
    title: 'Flat Subscription',
    subtitle: 'End-user products, B2C SaaS',
    description: 'Simple monthly subscription. Track per-customer serving costs to understand margins.',
    priceLabel: '$29/mo flat',
    icon: 'SaaS',
    config: {
      billableMetrics: [
        { name: 'Requests', code: 'requests', aggregationType: 'count_agg' },
      ],
      plans: [{
        name: 'Pro',
        code: 'pro',
        interval: 'monthly',
        amountCents: 2900,
        currency: 'USD',
        charges: [],
      }],
      costModels: [
        { name: 'Serving Costs', metricCode: 'requests', costType: 'per_unit', amountCents: 2 },
      ],
      features: [
        { name: 'Pro Features', code: 'pro_features' },
      ],
    },
  },
  {
    id: 'saas-usage',
    title: 'SaaS + Usage Overage',
    subtitle: 'API platforms, developer tools',
    description: 'Monthly subscription with metered overage. Customers pay a base fee and extra for usage above their limit.',
    priceLabel: '$29/mo + $0.002/call',
    icon: 'API',
    config: {
      billableMetrics: [
        { name: 'API Calls', code: 'api_calls', aggregationType: 'count_agg' },
      ],
      plans: [{
        name: 'Starter',
        code: 'starter',
        interval: 'monthly',
        amountCents: 2900,
        currency: 'USD',
        charges: [
          {
            billableMetricCode: 'api_calls',
            chargeModel: 'graduated',
            properties: {
              graduated_ranges: [
                { from_value: 0, to_value: 10000, per_unit_amount: '0', flat_amount: '0' },
                { from_value: 10001, to_value: null, per_unit_amount: '0.002', flat_amount: '0' },
              ],
            },
          },
        ],
      }],
      costModels: [
        { name: 'API Infrastructure', metricCode: 'api_calls', costType: 'per_unit', amountCents: 5 },
      ],
      features: [
        { name: 'API Access', code: 'api_access', billableMetricCode: 'api_calls' },
      ],
    },
  },
  {
    id: 'compute',
    title: 'Compute / Infrastructure',
    subtitle: 'Cloud platforms, CI/CD, GPU rentals',
    description: 'Tiered usage pricing for compute resources. Costs scale with volume.',
    priceLabel: 'Tiered per hour',
    icon: 'Infra',
    config: {
      billableMetrics: [
        { name: 'Compute Hours', code: 'compute_hours', aggregationType: 'sum_agg', fieldName: 'duration_hours' },
      ],
      plans: [{
        name: 'Compute',
        code: 'compute',
        interval: 'monthly',
        amountCents: 0,
        currency: 'USD',
        charges: [
          {
            billableMetricCode: 'compute_hours',
            chargeModel: 'graduated',
            properties: {
              graduated_ranges: [
                { from_value: 0, to_value: 100, per_unit_amount: '0.50', flat_amount: '0' },
                { from_value: 101, to_value: 1000, per_unit_amount: '0.35', flat_amount: '0' },
                { from_value: 1001, to_value: null, per_unit_amount: '0.20', flat_amount: '0' },
              ],
            },
          },
        ],
      }],
      costModels: [
        {
          name: 'Infrastructure Costs',
          metricCode: 'compute_hours',
          costType: 'tiered',
          tiers: [
            { up_to: 100, unit_amount_cents: 25, flat_amount_cents: 0 },
            { up_to: 1000, unit_amount_cents: 18, flat_amount_cents: 0 },
            { up_to: null, unit_amount_cents: 12, flat_amount_cents: 0 },
          ],
        },
      ],
      features: [
        { name: 'Compute Access', code: 'compute_access', billableMetricCode: 'compute_hours' },
      ],
    },
  },
  {
    id: 'credit-based',
    title: 'Credit System',
    subtitle: 'AI platforms, marketplaces, action-based',
    description: 'Customers buy credits upfront. Different actions consume different amounts.',
    priceLabel: 'Buy credits, deduct per use',
    icon: 'Credits',
    config: {
      billableMetrics: [
        { name: 'Credits Used', code: 'credits_used', aggregationType: 'sum_agg', fieldName: 'credits' },
      ],
      plans: [{
        name: 'Free Tier',
        code: 'free',
        interval: 'monthly',
        amountCents: 0,
        currency: 'USD',
        charges: [
          {
            billableMetricCode: 'credits_used',
            chargeModel: 'standard',
            properties: { amount: '0.01' },
          },
        ],
      }],
      costModels: [
        { name: 'Per-Credit Costs', metricCode: 'credits_used', costType: 'per_unit', amountCents: 1 },
      ],
      features: [
        { name: 'Credits', code: 'credits', billableMetricCode: 'credits_used' },
      ],
    },
  },
]
