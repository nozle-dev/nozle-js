import prompts from 'prompts'
import { validateProjectName, validateProjectPath } from './validation.js'
import { detectPackageManager, type PackageManager } from '../utils/install-deps.js'

export interface ProjectConfig {
  projectName: string
  template: 'app-router-ts' | 'flat-subscription' | 'saas-usage' | 'compute' | 'credit-based' // Billing template type
  useTailwind: boolean // Tailwind CSS support
  packageManager: PackageManager
  skipSetup: boolean // Setup wizard
}

export async function promptProjectConfig(
  initialName?: string,
  cwd: string = process.cwd()
): Promise<ProjectConfig | null> {
  const detectedPkgManager = await detectPackageManager()

  const response = await prompts(
    [
      {
        type: initialName ? null : 'text',
        name: 'projectName',
        message: 'What is your project named?',
        initial: 'my-nozle-app',
        validate: (value: string) => {
          const nameValidation = validateProjectName(value)
          if (nameValidation !== true) return nameValidation

          // We'll check path existence later
          return true
        },
      },
      {
        type: 'select',
        name: 'packageManager',
        message: 'Which package manager?',
        choices: [
          { title: 'npm', value: 'npm' },
          { title: 'pnpm', value: 'pnpm' },
          { title: 'yarn', value: 'yarn' },
          { title: 'bun', value: 'bun' },
        ],
        initial: ['npm', 'pnpm', 'yarn', 'bun'].indexOf(detectedPkgManager),
      },
    ],
    {
      onCancel: () => {
        console.log('\nOperation cancelled.')
        process.exit(0)
      },
    }
  )

  if (!response) return null

  const projectName = initialName || response.projectName

  // Validate project path doesn't exist
  const pathValidation = await validateProjectPath(projectName, cwd)
  if (pathValidation !== true) {
    console.error(`\n${pathValidation}`)
    process.exit(1)
  }

  return {
    projectName,
    template: 'app-router-ts', // Always use App Router + TypeScript
    useTailwind: true, // Always include Tailwind CSS
    packageManager: response.packageManager,
    skipSetup: false, // Setup is mandatory - cannot be skipped
  }
}
