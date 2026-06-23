import prompts from 'prompts'
import ora from 'ora'
import chalk from 'chalk'
import { validateApiKey as validateApiKeyFormat } from './validation.js'
import { validateApiKey, derivePublicKey, configureWorkspace } from '../api/nozle-client.js'
import { logger } from '../utils/logger.js'
import type { Nozle } from '@nozle-js/node'

export type TemplateType = 'flat-subscription' | 'saas-usage' | 'compute' | 'credit-based'

export interface SetupConfig {
  template: TemplateType
  apiKey: string
  publicKey: string
  workspaceId?: string
  nozle: Nozle
  featureCodes: string[]
}

export async function promptSetupWizard(): Promise<SetupConfig | null> {
  logger.header('Nozle Setup Wizard')
  logger.info('Let\'s configure your billing infrastructure!')
  logger.newline()

  // Step 1: Template Selection
  logger.step(1, 3, '🎨 Choose Your Template')
  logger.info('Select the billing model that matches your use case:')
  logger.newline()

  const templateResponse = await prompts({
    type: 'select',
    name: 'template',
    message: 'Which template best fits your product?',
    choices: [
      {
        title: 'Flat Subscription',
        value: 'flat-subscription',
        description: 'SaaS workspace with flat monthly pricing (e.g., Notion, Linear)'
      },
      {
        title: 'SaaS + Usage',
        value: 'saas-usage',
        description: 'API platform with base fee + overage (e.g., Stripe, Twilio)'
      },
      {
        title: 'Compute/Infrastructure',
        value: 'compute',
        description: 'Cloud platform with tiered usage (e.g., Vercel, Railway)'
      },
      {
        title: 'Credit-Based',
        value: 'credit-based',
        description: 'Prepaid credits for actions (e.g., Midjourney, Canva)'
      },
    ]
  })

  if (!templateResponse.template) return null

  const template = templateResponse.template as TemplateType

  logger.success(`Selected: ${getTemplateName(template)}`)
  logger.newline()

  // Step 2: API Key
  logger.step(2, 3, '🔑 API Key Setup')

  const apiKeyResponse = await prompts({
    type: 'password',
    name: 'apiKey',
    message: 'Enter your Nozle API key (starts with sk_):',
    validate: (value: string) => validateApiKeyFormat(value),
  })

  if (!apiKeyResponse.apiKey) return null

  const baseUrl = process.env.NOZLE_API_URL || 'https://api.nozle.ai'
  const spinner = ora(`Validating API key (${baseUrl})...`).start()
  const validation = await validateApiKey(apiKeyResponse.apiKey)

  if (!validation.valid || !validation.nozle) {
    spinner.fail('API key validation failed')
    logger.error(validation.error || 'Unknown error')
    logger.newline()
    logger.info('Troubleshooting:')
    logger.info('  • Check your API key in the Nozle dashboard')
    logger.info('  • For local dev: set NOZLE_API_URL=http://localhost:8080')
    logger.info('  • Ensure backend is running and accessible')
    return null
  }

  spinner.succeed(`API key validated (${baseUrl})`)
  logger.success('Connected to Nozle')
  const publicKey = derivePublicKey(apiKeyResponse.apiKey)

  logger.newline()

  // Step 3: Configure Workspace with Template
  logger.step(3, 3, '⚙️ Creating Billing Infrastructure')
  logger.info(getTemplateDescription(template))
  logger.newline()

  const configSpinner = ora('Creating billable metrics, plans, and features...').start()

  try {
    const { ONBOARDING_TEMPLATES } = await import('../constants/plan-templates.js')
    const templateConfig = ONBOARDING_TEMPLATES.find(t => t.id === template)

    if (!templateConfig) {
      throw new Error(`Template config not found for: ${template}`)
    }

    // Create complete workspace infrastructure in database
    const success = await configureWorkspace(validation.nozle, templateConfig.config)

    if (!success) {
      throw new Error('Failed to create billing infrastructure')
    }

    configSpinner.succeed('Billing infrastructure created')

    // Show what was created
    logger.newline()
    logger.info(chalk.dim('Created in your workspace:'))
    templateConfig.config.billableMetrics.forEach(m => {
      logger.info(chalk.dim(`  • Metric: ${m.name} (${m.code})`))
    })
    templateConfig.config.plans.forEach(p => {
      logger.info(chalk.dim(`  • Plan: ${p.name} (${p.code})`))
    })
    if (templateConfig.config.features) {
      templateConfig.config.features.forEach(f => {
        logger.info(chalk.dim(`  • Feature: ${f.name} (${f.code})`))
      })
    }
  } catch (error) {
    configSpinner.fail('Failed to configure workspace')
    logger.error(error instanceof Error ? error.message : 'Unknown error')
    return null
  }

  logger.newline()
  logger.divider()
  logger.success('Setup complete!')
  logger.divider()
  logger.newline()

  return {
    template,
    apiKey: apiKeyResponse.apiKey,
    publicKey,
    workspaceId: undefined,
    nozle: validation.nozle,
    featureCodes: []
  }
}

function getTemplateName(template: TemplateType): string {
  const names = {
    'flat-subscription': 'Flat Subscription',
    'saas-usage': 'SaaS + Usage',
    'compute': 'Compute/Infrastructure',
    'credit-based': 'Credit-Based',
  }
  return names[template]
}

function getTemplateDescription(template: TemplateType): string {
  const descriptions = {
    'flat-subscription': 'Setting up flat subscription billing with feature gates...',
    'saas-usage': 'Setting up usage-based billing with overage tracking...',
    'compute': 'Setting up tiered compute billing...',
    'credit-based': 'Setting up prepaid credit system...',
  }
  return descriptions[template]
}
