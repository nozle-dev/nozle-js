import { fetchTemplate, type TemplateType } from './fetch-template.js'

/**
 * Copy template to destination
 * Fetches from GitHub (templates repo is the single source of truth)
 * No bundled templates - always fresh from GitHub
 */
export async function copyTemplate(
  template: TemplateType,
  destination: string
): Promise<void> {
  await fetchTemplate(template, destination)
}

export async function writeEnvFile(
  destination: string,
  config: {
    apiKey?: string
    publicKey?: string
    workspaceId?: string
    features?: Record<string, boolean>
  }
): Promise<void> {
  const envPath = path.join(destination, '.env.local')

  let content = '# Nozle API Keys\n'

  if (config.apiKey) {
    content += `NOZLE_API_KEY=${config.apiKey}\n`
  }

  if (config.publicKey) {
    content += `NEXT_PUBLIC_NOZLE_API_KEY=${config.publicKey}\n`
  }

  if (config.workspaceId) {
    content += `NOZLE_WORKSPACE_ID=${config.workspaceId}\n`
  }

  content += '\n# Stripe (add your keys)\n'
  content += 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=\n'
  content += 'STRIPE_SECRET_KEY=\n'

  if (config.features && Object.keys(config.features).length > 0) {
    content += '\n# Feature Gates\n'
    for (const [feature, enabled] of Object.entries(config.features)) {
      const envKey = `NEXT_PUBLIC_FEATURE_${feature.toUpperCase()}`
      content += `${envKey}=${enabled}\n`
    }
  }

  await fs.writeFile(envPath, content, 'utf-8')
}

export async function updatePackageJson(
  destination: string,
  projectName: string
): Promise<void> {
  const packageJsonPath = path.join(destination, 'package.json')
  const packageJson = await fs.readJson(packageJsonPath)

  packageJson.name = projectName

  await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 })
}
