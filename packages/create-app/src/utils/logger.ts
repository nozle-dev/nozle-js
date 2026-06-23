import chalk from 'chalk'

export const logger = {
  info: (message: string) => {
    console.log(chalk.blue('ℹ'), message)
  },

  success: (message: string) => {
    console.log(chalk.green('✓'), message)
  },

  error: (message: string) => {
    console.log(chalk.red('✗'), message)
  },

  warn: (message: string) => {
    console.log(chalk.yellow('⚠'), message)
  },

  step: (current: number, total: number, title: string) => {
    console.log(chalk.cyan(`\n${title} (${current}/${total})`))
    console.log(chalk.gray('━'.repeat(50)))
  },

  header: (text: string) => {
    console.log(chalk.bold.cyan(`\n🚀 ${text}\n`))
  },

  tip: (message: string) => {
    console.log(chalk.gray('💡 Tip:'), chalk.gray(message))
  },

  newline: () => {
    console.log()
  },

  divider: () => {
    console.log(chalk.gray('─'.repeat(50)))
  },
}
