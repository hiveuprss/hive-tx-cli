import { Command } from 'commander'
import chalk from 'chalk'
import { getConfig } from '../config.js'
import type { HiveOperation } from '../types.js'
import { createSpinner, getAccountName, getClient, isJsonMode, unwrapResult } from '../utils.js'

const communityCmd = new Command('community')
  .description('Community tools')

const communitySearchCmd = new Command('search')
  .description('Search communities')
  .argument('<query>', 'Search query')
  .action(async (query: string) => {
    const spinner = createSpinner('Searching communities...').start()
    try {
      const client = await getClient()
      const rawResult = await client.call('bridge', 'list_communities', { query })
      const result = unwrapResult(rawResult)
      spinner.stop()

      if (isJsonMode()) {
        console.log(JSON.stringify(rawResult, null, 2))
        return
      }

      const communities = Array.isArray(result) ? result : []
      if (communities.length === 0) {
        console.log(chalk.yellow('No communities found.'))
        return
      }

      for (const community of communities) {
        console.log(`${chalk.green(community.name)} - ${community.title}`)
        console.log(`  Subscribers: ${community.subscribers} | Posts: ${community.num_pending || community.num_posts || community.posts || 0}`)
      }
    } catch (error: any) {
      spinner.fail(error.message)
      process.exit(1)
    }
  })

const communityInfoCmd = new Command('info')
  .description('Get community details')
  .argument('<name>', 'Community name (e.g., hive-12345)')
  .action(async (name: string) => {
    const spinner = createSpinner('Fetching community info...').start()
    try {
      const client = await getClient()
      const rawResult = await client.call('bridge', 'get_community', { name })
      const result = unwrapResult(rawResult)
      spinner.stop()

      if (isJsonMode()) {
        console.log(JSON.stringify(rawResult, null, 2))
        return
      }

      console.log(JSON.stringify(result, null, 2))
    } catch (error: any) {
      spinner.fail(error.message)
      process.exit(1)
    }
  })

const communitySubscribersCmd = new Command('subscribers')
  .description('List community subscribers')
  .argument('<name>', 'Community name (e.g., hive-12345)')
  .action(async (name: string) => {
    const spinner = createSpinner('Fetching community subscribers...').start()
    try {
      const client = await getClient()
      const rawResult = await client.call('bridge', 'list_subscribers', { community: name })
      const result = unwrapResult(rawResult)
      spinner.stop()

      if (isJsonMode()) {
        console.log(JSON.stringify(rawResult, null, 2))
        return
      }

      const subscribers = Array.isArray(result) ? result : []
      if (subscribers.length === 0) {
        console.log(chalk.yellow('No subscribers found.'))
        return
      }

      for (const subscriber of subscribers) {
        if (typeof subscriber === 'string') {
          console.log(subscriber)
        } else {
          console.log(subscriber.name || JSON.stringify(subscriber))
        }
      }
    } catch (error: any) {
      spinner.fail(error.message)
      process.exit(1)
    }
  })

const communitySubscribeCmd = new Command('subscribe')
  .description('Subscribe to a community')
  .argument('<name>', 'Community name (e.g., hive-12345)')
  .option('--account <name>', 'Account name (defaults to configured account)')
  .action(async (name: string, options) => {
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
          id: 'community',
          json: JSON.stringify(['subscribe', { community: name }])
        }
      }
    ]

    const spinner = createSpinner('Broadcasting community subscribe...').start()
    try {
      const client = await getClient()
      const result = await client.broadcast(operations, 'posting')
      spinner.succeed('Community subscribed successfully')
      console.log(JSON.stringify(result, null, 2))
    } catch (error: any) {
      spinner.fail(error.message)
      process.exit(1)
    }
  })

const communityUnsubscribeCmd = new Command('unsubscribe')
  .description('Unsubscribe from a community')
  .argument('<name>', 'Community name (e.g., hive-12345)')
  .option('--account <name>', 'Account name (defaults to configured account)')
  .action(async (name: string, options) => {
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
          id: 'community',
          json: JSON.stringify(['unsubscribe', { community: name }])
        }
      }
    ]

    const spinner = createSpinner('Broadcasting community unsubscribe...').start()
    try {
      const client = await getClient()
      const result = await client.broadcast(operations, 'posting')
      spinner.succeed('Community unsubscribed successfully')
      console.log(JSON.stringify(result, null, 2))
    } catch (error: any) {
      spinner.fail(error.message)
      process.exit(1)
    }
  })

communityCmd.addCommand(communitySearchCmd)
communityCmd.addCommand(communityInfoCmd)
communityCmd.addCommand(communitySubscribeCmd)
communityCmd.addCommand(communityUnsubscribeCmd)
communityCmd.addCommand(communitySubscribersCmd)

export const communityCommands = [communityCmd]
