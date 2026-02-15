import { Command } from 'commander'
import chalk from 'chalk'
import { getConfig } from '../config.js'
import type { HiveOperation } from '../types.js'
import { createSpinner, getAccountName, getClient } from '../utils.js'

const followCommand = new Command('follow')
  .description('Follow an account')
  .argument('<target>', 'Account to follow')
  .option('--account <name>', 'Follower account name (defaults to configured account)')
  .action(async (target: string, options) => {
    const config = await getConfig()
    const account = getAccountName(config, options)

    if (!account) {
      console.error(chalk.red('Account not specified. Use --account, HIVE_ACCOUNT, or configure with "hive config"'))
      process.exit(1)
    }

    const operations: HiveOperation[] = [
      {
        type: 'custom_json',
        value: {
          required_auths: [],
          required_posting_auths: [account],
          id: 'follow',
          json: JSON.stringify([
            'follow',
            {
              follower: account,
              following: target,
              what: ['blog']
            }
          ])
        }
      }
    ]

    const spinner = createSpinner('Broadcasting follow...').start()
    try {
      const client = await getClient()
      const result = await client.broadcast(operations, 'posting')
      spinner.succeed('Follow broadcasted successfully')
      console.log(JSON.stringify(result, null, 2))
    } catch (error: any) {
      spinner.fail(error.message)
      process.exit(1)
    }
  })

const unfollowCommand = new Command('unfollow')
  .description('Unfollow an account')
  .argument('<target>', 'Account to unfollow')
  .option('--account <name>', 'Follower account name (defaults to configured account)')
  .action(async (target: string, options) => {
    const config = await getConfig()
    const account = getAccountName(config, options)

    if (!account) {
      console.error(chalk.red('Account not specified. Use --account, HIVE_ACCOUNT, or configure with "hive config"'))
      process.exit(1)
    }

    const operations: HiveOperation[] = [
      {
        type: 'custom_json',
        value: {
          required_auths: [],
          required_posting_auths: [account],
          id: 'follow',
          json: JSON.stringify([
            'follow',
            {
              follower: account,
              following: target,
              what: []
            }
          ])
        }
      }
    ]

    const spinner = createSpinner('Broadcasting unfollow...').start()
    try {
      const client = await getClient()
      const result = await client.broadcast(operations, 'posting')
      spinner.succeed('Unfollow broadcasted successfully')
      console.log(JSON.stringify(result, null, 2))
    } catch (error: any) {
      spinner.fail(error.message)
      process.exit(1)
    }
  })

const muteCommand = new Command('mute')
  .description('Mute an account')
  .argument('<target>', 'Account to mute')
  .option('--account <name>', 'Muter account name (defaults to configured account)')
  .action(async (target: string, options) => {
    const config = await getConfig()
    const account = getAccountName(config, options)

    if (!account) {
      console.error(chalk.red('Account not specified. Use --account, HIVE_ACCOUNT, or configure with "hive config"'))
      process.exit(1)
    }

    const operations: HiveOperation[] = [
      {
        type: 'custom_json',
        value: {
          required_auths: [],
          required_posting_auths: [account],
          id: 'follow',
          json: JSON.stringify([
            'follow',
            {
              follower: account,
              following: target,
              what: ['ignore']
            }
          ])
        }
      }
    ]

    const spinner = createSpinner('Broadcasting mute...').start()
    try {
      const client = await getClient()
      const result = await client.broadcast(operations, 'posting')
      spinner.succeed('Mute broadcasted successfully')
      console.log(JSON.stringify(result, null, 2))
    } catch (error: any) {
      spinner.fail(error.message)
      process.exit(1)
    }
  })

const unmuteCommand = new Command('unmute')
  .description('Unmute an account')
  .argument('<target>', 'Account to unmute')
  .option('--account <name>', 'Unmuter account name (defaults to configured account)')
  .action(async (target: string, options) => {
    const config = await getConfig()
    const account = getAccountName(config, options)

    if (!account) {
      console.error(chalk.red('Account not specified. Use --account, HIVE_ACCOUNT, or configure with "hive config"'))
      process.exit(1)
    }

    const operations: HiveOperation[] = [
      {
        type: 'custom_json',
        value: {
          required_auths: [],
          required_posting_auths: [account],
          id: 'follow',
          json: JSON.stringify([
            'follow',
            {
              follower: account,
              following: target,
              what: []
            }
          ])
        }
      }
    ]

    const spinner = createSpinner('Broadcasting unmute...').start()
    try {
      const client = await getClient()
      const result = await client.broadcast(operations, 'posting')
      spinner.succeed('Unmute broadcasted successfully')
      console.log(JSON.stringify(result, null, 2))
    } catch (error: any) {
      spinner.fail(error.message)
      process.exit(1)
    }
  })

const reblogCommand = new Command('reblog')
  .description('Reblog a post')
  .requiredOption('-a, --author <name>', 'Author of the post')
  .requiredOption('-p, --permlink <string>', 'Permlink of the post')
  .option('--account <name>', 'Reblogger account name (defaults to configured account)')
  .action(async (options) => {
    const config = await getConfig()
    const account = getAccountName(config, options)

    if (!account) {
      console.error(chalk.red('Account not specified. Use --account, HIVE_ACCOUNT, or configure with "hive config"'))
      process.exit(1)
    }

    const operations: HiveOperation[] = [
      {
        type: 'custom_json',
        value: {
          required_auths: [],
          required_posting_auths: [account],
          id: 'follow',
          json: JSON.stringify([
            'reblog',
            {
              account,
              author: options.author,
              permlink: options.permlink
            }
          ])
        }
      }
    ]

    const spinner = createSpinner('Broadcasting reblog...').start()
    try {
      const client = await getClient()
      const result = await client.broadcast(operations, 'posting')
      spinner.succeed('Reblog broadcasted successfully')
      console.log(JSON.stringify(result, null, 2))
    } catch (error: any) {
      spinner.fail(error.message)
      process.exit(1)
    }
  })

export const socialCommands = [
  followCommand,
  unfollowCommand,
  muteCommand,
  unmuteCommand,
  reblogCommand
]
