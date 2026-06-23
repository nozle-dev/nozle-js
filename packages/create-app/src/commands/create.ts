import path from 'path'
import fs from 'fs-extra'
import ora from 'ora'
import chalk from 'chalk'
import { promptProjectConfig } from '../prompts/project.js'
import { promptSetupWizard } from '../prompts/setup.js'
import { copyTemplate, writeEnvFile, updatePackageJson } from '../utils/copy-template.js'
import { installDependencies, getRunCommand } from '../utils/install-deps.js'
import { generateFeatureGates, generateMiddleware, generateFeatureEnvVars } from '../generators/feature-gates.js'
import { logger } from '../utils/logger.js'

export interface CreateOptions {
  template?: 'flat-subscription' | 'saas-usage' | 'compute' | 'credit-based'
  noTailwind?: boolean
  pkgManager?: 'npm' | 'pnpm' | 'yarn' | 'bun'
  noInstall?: boolean
}

export async function createApp(
  projectName: string | undefined,
  options: CreateOptions
): Promise<void> {
  const cwd = process.cwd()

  // Show banner first
  logger.banner('NOZLE')
  logger.newline()
  logger.box('Create your SaaS with billing in 2 minutes', { borderColor: 'magenta' })
  logger.newline()

  // Step 1: Project configuration
  const projectConfig = await promptProjectConfig(projectName, cwd)

  if (!projectConfig) {
    process.exit(1)
  }

  // Override with CLI options if provided
  if (options.template) projectConfig.template = options.template
  if (options.noTailwind) projectConfig.useTailwind = false
  if (options.pkgManager) projectConfig.packageManager = options.pkgManager

  const projectPath = path.join(cwd, projectConfig.projectName)

  // Step 2: Setup wizard (mandatory)
  const setupConfig = await promptSetupWizard()

  if (!setupConfig) {
    process.exit(1)
  }

  // Step 3: Create project directory
  logger.newline()
  logger.header('Generating your Nozle app...')

  const dirSpinner = ora('Creating project directory...').start()
  await fs.ensureDir(projectPath)
  dirSpinner.succeed('Project directory created')

  // Step 4: Copy template - different paths for onboarded vs new users
  if (setupConfig.onboarded) {
    // User already onboarded - create simple Next.js with Nozle SDK
    logger.info(chalk.cyan('Scaffolding Next.js app with Nozle SDK...'))
    logger.newline()

    const templateSpinner = ora('Creating app structure...').start()
    await copyTemplate('flat-subscription', projectPath) // Use flat-subscription as base
    templateSpinner.succeed('App structure created')

    // Just write .env with API keys, no template-specific setup
    const envSpinner = ora('Configuring environment...').start()
    await writeEnvFile(projectPath, {
      apiKey: setupConfig.apiKey,
      publicKey: setupConfig.publicKey,
    })
    envSpinner.succeed('Environment configured')

  } else {
    // Normal template flow for new users
    const templateSpinner = ora(`Copying ${setupConfig.template} template...`).start()
    await copyTemplate(setupConfig.template!, projectPath)
    templateSpinner.succeed('Template copied')

    // Step 5: Update package.json
    const pkgSpinner = ora('Configuring package.json...').start()
    await updatePackageJson(projectPath, projectConfig.projectName)
    pkgSpinner.succeed('package.json configured')

    // Step 6: Generate feature gates
    if (setupConfig && setupConfig.featureCodes.length > 0) {
      const gatesSpinner = ora('Generating feature gates...').start()
      await generateFeatureGates(projectPath, setupConfig.featureCodes)
      // All templates use App Router
      await generateMiddleware(projectPath, setupConfig.featureCodes, 'app-router-ts')
      gatesSpinner.succeed(`Generated ${setupConfig.featureCodes.length} feature gate(s)`)
    }

    // Step 7: Generate .env.local
    const envSpinner = ora('Generating environment variables...').start()

    const features = setupConfig.featureCodes.length > 0
      ? generateFeatureEnvVars(setupConfig.featureCodes)
      : undefined

    await writeEnvFile(projectPath, {
      apiKey: setupConfig.apiKey,
      publicKey: setupConfig.publicKey,
      workspaceId: setupConfig.workspaceId,
      features,
    })

    envSpinner.succeed('Environment variables configured')
  }

  // Step 8: Install dependencies
  if (!options.noInstall) {
    logger.newline()
    await installDependencies(projectPath, projectConfig.packageManager)
  }

  // Enhanced success message
  logger.newline()
  logger.celebrate()
  logger.newline()
  logger.banner('SUCCESS')
  logger.newline()

  const templateName = setupConfig.onboarded
    ? 'Next.js with Nozle SDK'
    : getTemplateName(setupConfig.template!)

  logger.box(
    chalk.bold.green('Your Nozle app is ready! 🎉\n\n') +
    chalk.white(`Project: ${chalk.cyan(projectConfig.projectName)}\n`) +
    chalk.white(`Template: ${chalk.cyan(templateName)}\n`) +
    chalk.white(`Location: ${chalk.dim(projectPath)}`),
    { borderColor: 'green', padding: 1, margin: 1 }
  )

  logger.newline()
  logger.gradientText('Next steps:', 'rainbow')
  logger.info(`  1. ${chalk.cyan(`cd ${projectConfig.projectName}`)}`)

  if (!setupConfig.onboarded && setupConfig.featureCodes.length > 0) {
    logger.info(`  2. ${chalk.cyan('Update feature flags in .env.local based on your plan')}`)
    logger.info(`  3. ${chalk.cyan('Add Stripe keys to .env.local')}`)
  } else if (!setupConfig.onboarded) {
    logger.info(`  2. ${chalk.cyan('Add Stripe keys to .env.local')}`)
  }

  const runCmd = getRunCommand(projectConfig.packageManager)
  const stepNum = setupConfig.onboarded ? 2 : (setupConfig.featureCodes.length > 0 ? 4 : 3)
  logger.info(`  ${stepNum}. ${chalk.cyan(`${runCmd} dev`)}`)
  logger.newline()

  logger.info(chalk.gray('Happy building! 🎉'))
  logger.newline()

function getTemplateName(template: string): string {
  const names: Record<string, string> = {
    'flat-subscription': 'Flat Subscription',
    'saas-usage': 'SaaS + Usage',
    'compute': 'Compute/Infrastructure',
    'credit-based': 'Credit-Based',
  }
  return names[template] || template
}
}
