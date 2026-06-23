import { execa } from 'execa'
import fs from 'fs-extra'
import path from 'path'
import os from 'os'
import ora from 'ora'

const TEMPLATES_REPO_URL = 'https://github.com/nozle-dev/templates.git'
const TEMPLATES_BRANCH = 'main'

export type TemplateType = 'flat-subscription' | 'saas-usage' | 'compute' | 'credit-based'

/**
 * Fetch template from GitHub repository
 * This makes templates repo the single source of truth
 */
export async function fetchTemplate(
  template: TemplateType,
  destination: string
): Promise<void> {
  const spinner = ora('Fetching latest template from GitHub...').start()

  try {
    // Create a temporary directory for cloning
    const tempDir = path.join(os.tmpdir(), `nozle-template-${Date.now()}`)
    await fs.ensureDir(tempDir)

    try {
      // Clone the repository (sparse checkout for single template)
      spinner.text = 'Cloning template repository...'

      // Initialize git repo
      await execa('git', ['init'], { cwd: tempDir })

      // Add remote
      await execa('git', ['remote', 'add', 'origin', TEMPLATES_REPO_URL], { cwd: tempDir })

      // Enable sparse checkout
      await execa('git', ['config', 'core.sparseCheckout', 'true'], { cwd: tempDir })

      // Set sparse checkout path (only fetch the specific template)
      const sparseCheckoutFile = path.join(tempDir, '.git', 'info', 'sparse-checkout')
      await fs.ensureDir(path.dirname(sparseCheckoutFile))
      await fs.writeFile(sparseCheckoutFile, `${template}/\n`)

      // Pull the specific template
      spinner.text = `Downloading ${template} template...`
      await execa('git', ['pull', 'origin', TEMPLATES_BRANCH], { cwd: tempDir })

      // Copy the template to destination
      const templatePath = path.join(tempDir, template)

      if (!await fs.pathExists(templatePath)) {
        throw new Error(`Template '${template}' not found in repository`)
      }

      spinner.text = 'Copying template files...'
      await fs.copy(templatePath, destination, {
        filter: (src) => {
          // Exclude git, node_modules, and build artifacts
          const relativePath = path.relative(templatePath, src)
          return !relativePath.includes('.git') &&
                 !relativePath.includes('node_modules') &&
                 !relativePath.includes('.next') &&
                 !relativePath.startsWith('.env.local') &&
                 !relativePath.includes('.turbo')
        },
      })

      spinner.succeed('Template fetched successfully')
    } finally {
      // Cleanup temp directory
      await fs.remove(tempDir).catch(() => {
        // Ignore cleanup errors
      })
    }
  } catch (error) {
    spinner.fail('Failed to fetch template')

    if (error instanceof Error) {
      if (error.message.includes('git')) {
        throw new Error(
          'Failed to clone template repository. Make sure git is installed and you have internet access.\n' +
          `Repository: ${TEMPLATES_REPO_URL}`
        )
      }
      throw error
    }

    throw new Error('Unknown error while fetching template')
  }
}

// No bundled templates - all templates fetched from GitHub
// This keeps nozle-templates as the single source of truth
