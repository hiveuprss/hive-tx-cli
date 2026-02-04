import { Command } from 'commander'
import chalk from 'chalk'
import inquirer from 'inquirer'
import { getConfig, saveConfig, clearConfig } from '../config.js'
import type { Config } from '../types.js'

export const configCommand = new Command('config')
  .description('Manage Hive CLI configuration')
  .option('-s, --show', 'Show current configuration')
  .option('--clear', 'Clear all configuration')
  .action(async (options) => {
    if (options.show) {
      const config = await getConfig()
      if (config) {
        console.log(JSON.stringify(config, null, 2))
      } else {
        console.log(chalk.yellow('No configuration set'))
      }
      return
    }

    if (options.clear) {
      await clearConfig()
      console.log(chalk.green('Configuration cleared'))
      return
    }

    const existingConfig = await getConfig()

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'account',
        message: 'Hive account name:',
        default: existingConfig?.account || '',
        validate: (input: string) => input.length > 0 || 'Account name is required'
      },
      {
        type: 'input',
        name: 'postingKey',
        message: 'Posting key (optional but recommended):',
        default: existingConfig?.postingKey || ''
      },
      {
        type: 'input',
        name: 'activeKey',
        message: 'Active key (optional, required for transfers):',
        default: existingConfig?.activeKey || ''
      },
      {
        type: 'input',
        name: 'node',
        message: 'Hive node URL:',
        default: existingConfig?.node || 'https://api.hive.blog'
      }
    ])

    const config: Config = {
      account: answers.account,
      postingKey: answers.postingKey || undefined,
      activeKey: answers.activeKey || undefined,
      node: answers.node
    }

    await saveConfig(config)
    console.log(chalk.green('✔ Configuration saved'))
    console.log(chalk.dim(`Config location: ~/.hive-tx-cli/config.json`))
  })

configCommand
  .command('set <key> <value>')
  .description('Set a specific configuration value')
  .action(async (key: string, value: string) => {
    const config = (await getConfig()) || { account: '' }

    if (!['account', 'postingKey', 'activeKey', 'node'].includes(key)) {
      console.error(chalk.red(`Invalid key: ${key}`))
      console.log(chalk.dim('Valid keys: account, postingKey, activeKey, node'))
      process.exit(1)
    }

    ;(config as any)[key] = value
    await saveConfig(config)
    console.log(chalk.green(`✔ Set ${key}`))
  })

configCommand
  .command('get <key>')
  .description('Get a specific configuration value')
  .action(async (key: string) => {
    const config = await getConfig()

    if (!config) {
      console.log(chalk.yellow('No configuration found'))
      process.exit(1)
    }

    if (!['account', 'postingKey', 'activeKey', 'node'].includes(key)) {
      console.error(chalk.red(`Invalid key: ${key}`))
      process.exit(1)
    }

    const value = (config as any)[key]
    if (value) {
      console.log(value)
    } else {
      console.log(chalk.yellow('Not set'))
    }
  })
