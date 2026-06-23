import { Command } from 'commander'
import { createApp, type CreateOptions } from './commands/create.js'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readFileSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Read package.json for version
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf-8')
)

const program = new Command()

program
  .name('create-nozle-app')
  .description('Create a Next.js app with Nozle billing pre-integrated')
  .version(packageJson.version)
  .argument('[project-name]', 'Name of the project')
  .option('--no-tailwind', 'Don\'t include Tailwind CSS')
  .option(
    '-p, --pkg-manager <manager>',
    'Package manager to use (npm, pnpm, yarn, bun)'
  )
  .option('--no-install', 'Skip dependency installation')
  .action(async (projectName: string | undefined, options: CreateOptions) => {
    try {
      await createApp(projectName, options)
    } catch (error) {
      console.error('\nError:', error instanceof Error ? error.message : error)
      process.exit(1)
    }
  })

program.parse()
