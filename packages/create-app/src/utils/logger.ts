import chalk from 'chalk'
import gradient from 'gradient-string'
import figlet from 'figlet'
import boxen from 'boxen'

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

  // Enhanced visual methods
  banner: (text: string) => {
    const ascii = figlet.textSync(text, { font: 'ANSI Shadow' })
    const colored = gradient.pastel.multiline(ascii)
    console.log(colored)
  },

  box: (message: string, options?: Parameters<typeof boxen>[1]) => {
    console.log(boxen(message, {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: 'cyan',
      ...options
    }))
  },

  gradientText: (text: string, type: 'rainbow' | 'pastel' | 'vice' = 'pastel') => {
    console.log(gradient[type](text))
  },

  celebrate: () => {
    console.log(gradient.rainbow('🎉 ✨ 🎊 ✨ 🎉'))
  }
}
