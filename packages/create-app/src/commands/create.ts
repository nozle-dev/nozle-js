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
  template?: 'app-router-ts' | 'pages-router-ts'
  noTailwind?: boolean
  pkgManager?: 'npm' | 'pnpm' | 'yarn' | 'bun'
  noInstall?: boolean
}

export async function createApp(
  projectName: string | undefined,
  options: CreateOptions
): Promise<void> {
  const cwd = process.cwd()

  logger.header('Create Nozle App')

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
    logger.error('Setup is required to create a Nozle app.')
    process.exit(1)
  }

  // Step 3: Create project directory
  logger.newline()
  logger.header('Generating your Nozle app...')

  const dirSpinner = ora('Creating project directory...').start()
  await fs.ensureDir(projectPath)
  dirSpinner.succeed('Project directory created')

  // Step 4: Copy template (from setupConfig, not projectConfig)
  const templateSpinner = ora(`Copying ${setupConfig.template} template...`).start()
  await copyTemplate(setupConfig.template, projectPath)
  templateSpinner.succeed('Template copied')

  // Step 5: Update package.json
  const pkgSpinner = ora('Configuring package.json...').start()
  await updatePackageJson(projectPath, projectConfig.projectName)
  pkgSpinner.succeed('package.json configured')

  // Step 6: Generate feature gates
  if (setupConfig && setupConfig.featureCodes.length > 0) {
    const gatesSpinner = ora('Generating feature gates...').start()
    await generateFeatureGates(projectPath, setupConfig.featureCodes)
    await generateMiddleware(projectPath, setupConfig.featureCodes, projectConfig.template)
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

  // Step 8: Install dependencies
  if (!options.noInstall) {
    logger.newline()
    await installDependencies(projectPath, projectConfig.packageManager)
  }

  // Success message
  logger.newline()
  logger.divider()
  logger.success(chalk.bold.green(`✨ Success! Created ${projectConfig.projectName}`))
  logger.divider()
  logger.newline()

  logger.info('Next steps:')
  logger.info(`  1. ${chalk.cyan(`cd ${projectConfig.projectName}`)}`)

  if (setupConfig.featureCodes.length > 0) {
    logger.info(`  2. ${chalk.cyan('Update feature flags in .env.local based on your plan')}`)
    logger.info(`  3. ${chalk.cyan('Add Stripe keys to .env.local')}`)
  } else {
    logger.info(`  2. ${chalk.cyan('Add Stripe keys to .env.local')}`)
  }

  const runCmd = getRunCommand(projectConfig.packageManager)
  logger.info(`  ${setupConfig.featureCodes.length > 0 ? '4' : '3'}. ${chalk.cyan(`${runCmd} dev`)}`)
  logger.newline()

  logger.newline()
  logger.info(chalk.bold('✨ Your app is ready with:'))
  logger.info(`  • Template: ${chalk.cyan(setupConfig.template)}`)
  logger.info(`  • Full dashboard implementation`)
  logger.info(`  • API routes and billing integration`)
  logger.info(`  • Demo mode enabled (works without database)`)

  logger.newline()
  logger.info(chalk.bold('📚 Additional setup:'))
  logger.info(`  • Review ${chalk.cyan('.env.example')} and add Stripe keys`)
  logger.info(`  • For production: Set up PostgreSQL (see ${chalk.cyan('db/README.md')})`)
  logger.info(`  • Templates work in demo mode by default`)

  logger.newline()
  logger.info(chalk.gray('Happy building! 🎉'))
  logger.newline()
}
