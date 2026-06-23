import { execa } from 'execa'
import ora from 'ora'

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

export async function detectPackageManager(): Promise<PackageManager> {
  const userAgent = process.env.npm_config_user_agent || ''

  if (userAgent.includes('pnpm')) return 'pnpm'
  if (userAgent.includes('yarn')) return 'yarn'
  if (userAgent.includes('bun')) return 'bun'

  // Check if they have these installed
  try {
    await execa('bun', ['--version'])
    return 'bun'
  } catch {}

  try {
    await execa('pnpm', ['--version'])
    return 'pnpm'
  } catch {}

  try {
    await execa('yarn', ['--version'])
    return 'yarn'
  } catch {}

  return 'npm'
}

export async function installDependencies(
  directory: string,
  packageManager: PackageManager
): Promise<void> {
  const spinner = ora('Installing dependencies...').start()

  try {
    const installCommands: Record<PackageManager, string[]> = {
      npm: ['install'],
      pnpm: ['install'],
      yarn: ['install'],
      bun: ['install'],
    }

    await execa(packageManager, installCommands[packageManager], {
      cwd: directory,
      stdio: 'inherit',
    })

    spinner.succeed('Dependencies installed')
  } catch (error) {
    spinner.fail('Failed to install dependencies')
    throw error
  }
}

export function getRunCommand(packageManager: PackageManager): string {
  return packageManager === 'npm' ? 'npm run' : packageManager
}
