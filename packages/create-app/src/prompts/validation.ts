import validatePackageName from 'validate-npm-package-name'
import fs from 'fs-extra'
import path from 'path'

export function validateProjectName(name: string): string | true {
  const validation = validatePackageName(name)

  if (!validation.validForNewPackages) {
    const errors = [
      ...(validation.errors || []),
      ...(validation.warnings || []),
    ]
    return `Invalid project name: ${errors.join(', ')}`
  }

  return true
}

export async function validateProjectPath(name: string, cwd: string): Promise<string | true> {
  const projectPath = path.join(cwd, name)

  if (await fs.pathExists(projectPath)) {
    return `Directory "${name}" already exists. Please choose a different name.`
  }

  return true
}

export function validateApiKey(key: string): string | true {
  if (!key || key.trim().length === 0) {
    return 'API key cannot be empty'
  }

  if (!key.startsWith('sk_')) {
    return 'API key must start with "sk_" (secret key)'
  }

  if (key.length < 20) {
    return 'API key seems too short'
  }

  return true
}

export function validateFeatureCode(code: string): boolean {
  // Feature codes should be lowercase, alphanumeric with underscores
  return /^[a-z][a-z0-9_]*$/.test(code)
}

export function parseFeatureCodes(input: string): string[] {
  return input
    .split(',')
    .map((code) => code.trim())
    .filter((code) => code.length > 0 && validateFeatureCode(code))
}
