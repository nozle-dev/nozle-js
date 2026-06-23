import { Nozle } from '@nozle-js/node'
import type { OnboardingConfig } from '../constants/plan-templates.js'

export interface WorkspaceInfo {
  workspaceId?: string
  name?: string
}

export interface PlanInfo {
  code: string
  name: string
  amount_cents: number
  amount_currency: string
  interval: string
  description?: string
}

export interface ValidationResult {
  valid: boolean
  nozle: Nozle | null
  error?: string
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelay = 1000
): Promise<T> {
  let lastError: Error | unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      // Don't retry on auth errors (401)
      if (error instanceof Error && error.message.includes('401')) {
        throw error
      }

      // Don't retry on last attempt
      if (attempt === maxAttempts) {
        throw error
      }

      // Exponential backoff: 1s, 2s, 4s
      const delay = baseDelay * Math.pow(2, attempt - 1)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

export async function validateApiKey(apiKey: string): Promise<ValidationResult> {
  // Always use production URL
  const baseUrl = 'https://api.nozle.app'
  const eventsUrl = 'https://api.nozle.app'

  try {
    const nozle = new Nozle({ apiKey, baseUrl, eventsUrl })

    // Retry ping with exponential backoff
    const result = await retryWithBackoff(
      () => nozle.ping(),
      3, // 3 attempts
      1000 // 1s base delay
    )

    if (result.ok) {
      return { valid: true, nozle }
    } else {
      return {
        valid: false,
        nozle: null,
        error: 'Invalid API key. Check your Nozle dashboard.'
      }
    }
  } catch (error) {
    let errorMessage = error instanceof Error ? error.message : 'Unknown error'

    // Simplified error messages based on error type
    if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
      errorMessage = 'Invalid API key. Please check your key and try again.'
    } else if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
      errorMessage = 'API key does not have required permissions.'
    } else if (errorMessage.includes('fetch failed') || errorMessage.includes('ECONNREFUSED')) {
      errorMessage = 'Cannot connect to Nozle. Please check your internet connection.'
    } else if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('getaddrinfo')) {
      errorMessage = 'Cannot reach Nozle servers. Please check your internet connection.'
    } else if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
      errorMessage = 'Connection timed out. Please try again.'
    } else if (errorMessage.includes('certificate') || errorMessage.includes('SSL')) {
      errorMessage = 'SSL certificate error. Please check your network settings.'
    } else {
      errorMessage = 'Connection failed. Please try again.'
    }

    return {
      valid: false,
      nozle: null,
      error: errorMessage,
    }
  }
}

export async function fetchPlans(nozle: Nozle): Promise<PlanInfo[]> {
  try {
    const plans = await nozle.plans()
    return plans as PlanInfo[]
  } catch (error) {
    console.error('Failed to fetch plans:', error)
    return []
  }
}

export async function fetchWorkspaceInfo(nozle: Nozle): Promise<WorkspaceInfo> {
  // TODO: Implement when workspace API endpoint is available
  // For now, return placeholder
  return {
    workspaceId: undefined,
    name: 'Your Workspace',
  }
}

export async function getCurrentPlan(nozle: Nozle, customerId: string): Promise<string | null> {
  try {
    // Use the can endpoint to get current plan info
    const result = await nozle.can(customerId, 'any_feature')
    // Extract plan from result if available
    return null // TODO: Parse from result when API returns plan info
  } catch {
    return null
  }
}

export function derivePublicKey(secretKey: string): string {
  // Convert sk_live_xxx to pk_live_xxx or sk_test_xxx to pk_test_xxx
  return secretKey.replace(/^sk_/, 'pk_')
}

/**
 * Check if user is already onboarded by checking if they have any plans
 */
export async function checkOnboardingStatus(nozle: Nozle): Promise<boolean> {
  try {
    // If user has plans, they're onboarded
    const plans = await nozle.plans()
    return Array.isArray(plans) && plans.length > 0
  } catch (error) {
    // If plans endpoint fails, assume not onboarded
    console.error('Failed to check onboarding status:', error)
    return false
  }
}

/**
 * Configure workspace with billing infrastructure via GraphQL mutations
 * This replicates the flow from core's useOnboardingActions.createAll()
 */
export async function configureWorkspace(
  nozle: Nozle,
  config: OnboardingConfig
): Promise<boolean> {
  try {
    const apiKey = (nozle as any).apiKey
    if (!apiKey) {
      throw new Error('No API key found in Nozle client')
    }

    const graphqlUrl = 'https://core.nozle.app/graphql'

    // Helper function to make GraphQL requests
    async function graphql<T = any>(
      query: string,
      variables: Record<string, any>
    ): Promise<T> {
      const response = await fetch(graphqlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ query, variables }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`GraphQL request failed: ${response.status} ${errorText}`)
      }

      const result = await response.json() as { data?: T; errors?: any[] }

      if (result.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`)
      }

      return result.data as T
    }

    // 1. Create billable metrics and collect code → id mapping
    const metricIdByCode: Record<string, string> = {}

    for (const metric of config.billableMetrics) {
      const data = await graphql<{ createBillableMetric: { id: string } }>(
        `mutation CreateBillableMetric($input: CreateBillableMetricInput!) {
          createBillableMetric(input: $input) {
            id
          }
        }`,
        {
          input: {
            name: metric.name,
            code: metric.code,
            description: 'Created during onboarding',
            aggregationType: metric.aggregationType,
            fieldName: metric.fieldName,
          },
        }
      )

      const id = data.createBillableMetric?.id
      if (!id) throw new Error(`Failed to create metric: ${metric.name}`)

      metricIdByCode[metric.code] = id
    }

    // 2. Create plans with charges
    for (const plan of config.plans) {
      const charges = plan.charges.map((charge) => ({
        billableMetricId: metricIdByCode[charge.billableMetricCode],
        chargeModel: charge.chargeModel,
        properties: charge.properties,
      }))

      const data = await graphql<{ createPlan: { id: string } }>(
        `mutation CreatePlan($input: CreatePlanInput!) {
          createPlan(input: $input) {
            id
          }
        }`,
        {
          input: {
            name: plan.name,
            code: plan.code,
            interval: plan.interval,
            amountCents: plan.amountCents,
            amountCurrency: plan.currency,
            payInAdvance: true,
            charges,
          },
        }
      )

      if (!data.createPlan?.id) {
        throw new Error(`Failed to create plan: ${plan.name}`)
      }
    }

    // 3. Create cost models (if any)
    // Note: Cost models may not be available in all Nozle deployments
    // Wrap in try-catch to continue if not supported
    for (const cm of config.costModels) {
      try {
        await graphql(
          `mutation CreateCostModel(
            $name: String!
            $metricCode: String!
            $costType: String!
            $amountCents: Int
          ) {
            baseraCreateCostModel(
              name: $name
              metricCode: $metricCode
              costType: $costType
              amountCents: $amountCents
            ) {
              id
            }
          }`,
          {
            name: cm.name,
            metricCode: cm.metricCode,
            costType: cm.costType,
            amountCents: cm.amountCents,
          }
        )
      } catch (error) {
        // Silently continue if cost models not supported
        console.warn('Cost model creation skipped:', (error as Error).message)
      }
    }

    // 4. Create features
    if (config.features) {
      for (const feature of config.features) {
        const metricId = feature.billableMetricCode
          ? metricIdByCode[feature.billableMetricCode]
          : undefined

        await graphql<{ createFeature: { id: string } }>(
          `mutation CreateFeature($input: CreateFeatureInput!) {
            createFeature(input: $input) {
              id
            }
          }`,
          {
            input: {
              code: feature.code,
              name: feature.name,
              description: feature.description || feature.name,
              billableMetricId: metricId,
              privileges: [],
            },
          }
        )
      }
    }

    // 5. Mark organization as onboarded
    try {
      await graphql(
        `mutation MarkOrganizationOnboarded($input: UpdateOrganizationInput!) {
          updateOrganization(input: $input) {
            id
          }
        }`,
        {
          input: {
            onboarded: true,
          },
        }
      )
    } catch (error) {
      // Continue even if marking onboarded fails
      console.warn('Could not mark organization as onboarded:', (error as Error).message)
    }

    return true
  } catch (error) {
    console.error('Failed to configure workspace:', error)
    return false
  }
}
