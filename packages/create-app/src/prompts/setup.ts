import prompts from 'prompts'
import ora from 'ora'
import chalk from 'chalk'
import { validateApiKey as validateApiKeyFormat } from './validation.js'
import { validateApiKey, derivePublicKey, configureWorkspace, checkOnboardingStatus } from '../api/nozle-client.js'
import { logger } from '../utils/logger.js'
import type { Nozle } from '@nozle-js/node'

export type TemplateType = 'flat-subscription' | 'saas-usage' | 'compute' | 'credit-based'

export interface SetupConfig {
  template: TemplateType | null  // null for onboarded users
  apiKey: string
  publicKey: string
  workspaceId?: string
  nozle: Nozle
  featureCodes: string[]
  onboarded?: boolean  // Track if user is already onboarded
}

export async function promptSetupWizard(): Promise<SetupConfig | null> {
  // Step 1: API Key with retry loop
  logger.step(1, 2, '🔑 API Key Setup')

  let validation: { valid: boolean; nozle: any; error?: string } | null = null
  let apiKey = ''
  let publicKey = ''

  // Retry loop for API key validation
  while (!validation || !validation.valid) {
    const apiKeyResponse = await prompts({
      type: 'password',
      name: 'apiKey',
      message: validation ? 'Try again - Enter your Nozle API key (starts with sk_):' : 'Enter your Nozle API key (starts with sk_):',
      validate: (value: string) => validateApiKeyFormat(value),
    })

    if (!apiKeyResponse.apiKey) return null

    apiKey = apiKeyResponse.apiKey

    const spinner = ora('Validating API key...').start()
    validation = await validateApiKey(apiKey)

    if (!validation.valid || !validation.nozle) {
      spinner.fail('Validation failed')
      logger.error(validation.error || 'Unknown error')
      logger.newline()

      // Ask if user wants to retry
      const retryResponse = await prompts({
        type: 'confirm',
        name: 'retry',
        message: 'Would you like to try a different API key?',
        initial: true
      })

      if (!retryResponse.retry) {
        logger.newline()
        logger.info(chalk.dim('Setup cancelled. You can restart anytime with: npx create-nozle-app'))
        logger.newline()
        logger.error('A valid API key is required to create a Nozle app.')
        return null
      }

      logger.newline()
    } else {
      spinner.succeed('API key validated')
      logger.success('Connected to Nozle')
      publicKey = derivePublicKey(apiKey)
    }
  }

  logger.newline()

  // Check onboarding status
  const checkSpinner = ora('Checking your workspace...').start()
  const isOnboarded = await checkOnboardingStatus(validation!.nozle)
  checkSpinner.stop()

  if (isOnboarded) {
    // User is already onboarded - skip template wizard
    logger.newline()
    logger.box(
      chalk.green.bold('✓ You\'re all set!\n\n') +
      'Your workspace already has billing configured.\n' +
      'We\'ll create a Next.js app with Nozle SDK integrated.',
      { borderColor: 'green' }
    )
    logger.newline()

    return {
      template: null, // No template needed
      apiKey,
      publicKey,
      workspaceId: undefined,
      nozle: validation!.nozle,
      featureCodes: [],
      onboarded: true
    }
  }

  // User is NOT onboarded - show template wizard
  logger.newline()
  logger.step(2, 2, '🎨 Choose Your Template')
  logger.info('Select the billing model that matches your use case:')
  logger.newline()

  const templateResponse = await prompts({
    type: 'select',
    name: 'template',
    message: chalk.cyan('Which billing model matches your product?'),
    choices: [
      {
        title: chalk.bold.cyan('💳 Flat Subscription'),
        value: 'flat-subscription',
        description: chalk.white('Fixed monthly pricing • Notion, Linear, Slack\n')
      },
      {
        title: chalk.bold.magenta('📊 SaaS + Usage'),
        value: 'saas-usage',
        description: chalk.white('Base fee + usage overage • Stripe, Twilio, SendGrid\n')
      },
      {
        title: chalk.bold.blue('⚡ Compute/Infrastructure'),
        value: 'compute',
        description: chalk.white('Tiered usage pricing • Vercel, Railway, AWS\n')
      },
      {
        title: chalk.bold.yellow('🪙 Credit-Based'),
        value: 'credit-based',
        description: chalk.white('Prepaid action credits • Midjourney, Canva, Replicate\n')
      },
    ]
  })

  if (!templateResponse.template) return null

  const template = templateResponse.template as TemplateType

  logger.success(`Selected: ${getTemplateName(template)}`)
  logger.newline()

  // Configure Workspace with Template
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
    const success = await configureWorkspace(validation!.nozle, templateConfig.config)

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
    apiKey,
    publicKey,
    workspaceId: undefined,
    nozle: validation!.nozle,
    featureCodes: [],
    onboarded: false
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
