import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import inquirer from 'inquirer'
import { getConfig } from '../config.js'
import { HiveClient } from '../hive-client.js'
import type { HiveOperation } from '../types.js'
import { getAccountName } from '../utils.js'

async function getClient(): Promise<HiveClient> {
  const config = await getConfig()
  if (!config) {
    console.error(chalk.red('Configuration not found. Run "hive config" or set HIVE_ACCOUNT and key env vars.'))
    process.exit(1)
  }
  return new HiveClient(config)
}

const voteCmd = new Command('vote')
  .description('Vote on a post or comment')
  .requiredOption('-a, --author <name>', 'Author of the content')
  .requiredOption('-p, --permlink <string>', 'Permlink of the content')
  .requiredOption('-w, --weight <number>', 'Vote weight (1-100)', '100')
  .option('--account <name>', 'Voter account name (defaults to configured account)')
  .action(async (options) => {
    const config = await getConfig()
    const voter = getAccountName(config, options)

    if (!voter) {
      console.error(chalk.red('Account not specified. Use --account, HIVE_ACCOUNT, or configure with "hive config"'))
      process.exit(1)
    }

    const weight = parseInt(options.weight) * 100 // Convert to basis points

    const operations: HiveOperation[] = [
      {
        type: 'vote',
        value: {
          voter,
          author: options.author,
          permlink: options.permlink,
          weight
        }
      }
    ]

    const spinner = ora('Broadcasting vote...').start()
    try {
      const client = await getClient()
      const result = await client.broadcast(operations, 'posting')
      spinner.succeed('Vote broadcasted successfully')
      console.log(JSON.stringify(result, null, 2))
    } catch (error: any) {
      spinner.fail(error.message)
      process.exit(1)
    }
  })

const commentCmd = new Command('publish')
  .description('Create a post or comment')
  .alias('post')
  .alias('comment')
  .requiredOption('-p, --permlink <string>', 'Permlink for the post/comment')
  .requiredOption('-t, --title <string>', 'Title (for posts)')
  .requiredOption('-b, --body <string>', 'Content body')
  .option('--parent-author <name>', 'Parent author (for comments)', '')
  .option('--parent-permlink <string>', 'Parent permlink (for comments)', '')
  .option('--tags <tags>', 'Comma-separated tags', '')
  .option('--metadata <json>', 'Additional JSON metadata to merge', '{}')
  .option('--account <name>', 'Author account name (defaults to configured account)')
  .action(async (options) => {
    const config = await getConfig()
    const author = getAccountName(config, options)

    if (!author) {
      console.error(chalk.red('Account not specified. Use --account, HIVE_ACCOUNT, or configure with "hive config"'))
      process.exit(1)
    }

    // Parse user-provided metadata (default to empty object)
    let userMetadata: Record<string, unknown> = {}
    if (options.metadata && options.metadata !== '{}') {
      try {
        userMetadata = JSON.parse(options.metadata)
      } catch (error) {
        console.error(chalk.red('Invalid JSON in metadata option'))
        process.exit(1)
      }
    }

    // Build metadata with tags and merge user-provided metadata
    const metadata: Record<string, unknown> = {
      ...userMetadata
    }

    // Add tags if provided (tags takes precedence over any tags in metadata)
    if (options.tags) {
      metadata.tags = options.tags.split(',').map((t: string) => t.trim())
    }

    const jsonMetadata = Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : ''

    const operations: HiveOperation[] = [
      {
        type: 'comment',
        value: {
          parent_author: options.parentAuthor || '',
          parent_permlink: options.parentPermlink || options.permlink,
          author,
          permlink: options.permlink,
          title: options.title,
          body: options.body,
          json_metadata: jsonMetadata
        }
      }
    ]

    const spinner = ora('Broadcasting comment...').start()
    try {
      const client = await getClient()
      const result = await client.broadcast(operations, 'posting')
      spinner.succeed('Comment broadcasted successfully')
      console.log(JSON.stringify(result, null, 2))
    } catch (error: any) {
      spinner.fail(error.message)
      process.exit(1)
    }
  })

const transferCmd = new Command('transfer')
  .description('Transfer HIVE or HBD')
  .requiredOption('-t, --to <name>', 'Recipient account')
  .requiredOption('-a, --amount <string>', 'Amount (e.g., "1.000 HIVE")')
  .option('-m, --memo <string>', 'Transfer memo', '')
  .option('--account <name>', 'Sender account name (defaults to configured account)')
  .action(async (options) => {
    const config = await getConfig()
    const from = getAccountName(config, options)

    if (!from) {
      console.error(chalk.red('Account not specified. Use --account, HIVE_ACCOUNT, or configure with "hive config"'))
      process.exit(1)
    }

    if (!config?.activeKey) {
      const { proceed } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'proceed',
          message: chalk.yellow('Active key not configured. This operation requires an active key. Continue anyway?'),
          default: false
        }
      ])

      if (!proceed) {
        console.log(chalk.dim('Cancelled'))
        process.exit(0)
      }
    }

    const operations: HiveOperation[] = [
      {
        type: 'transfer',
        value: {
          from,
          to: options.to,
          amount: options.amount,
          memo: options.memo
        }
      }
    ]

    const spinner = ora('Broadcasting transfer...').start()
    try {
      const client = await getClient()
      const result = await client.broadcast(operations, 'active')
      spinner.succeed('Transfer broadcasted successfully')
      console.log(JSON.stringify(result, null, 2))
    } catch (error: any) {
      spinner.fail(error.message)
      process.exit(1)
    }
  })

const customJsonCmd = new Command('custom-json')
  .description('Broadcast custom JSON operation')
  .requiredOption('-i, --id <string>', 'Operation ID')
  .requiredOption('-j, --json <string>', 'JSON payload')
  .option('--required-posting <accounts>', 'Required posting auths (comma-separated)', '')
  .option('--required-active <accounts>', 'Required active auths (comma-separated)', '')
  .option('--account <name>', 'Account name (defaults to configured account)')
  .action(async (options) => {
    const config = await getConfig()
    const account = getAccountName(config, options)

    if (!account) {
      console.error(chalk.red('Account not specified. Use --account, HIVE_ACCOUNT, or configure with "hive config"'))
      process.exit(1)
    }

    const requiredPostingAuths = options.requiredPosting ? options.requiredPosting.split(',').map((a: string) => a.trim()) : [account]

    const requiredAuths = options.requiredActive ? options.requiredActive.split(',').map((a: string) => a.trim()) : []

    const operations: HiveOperation[] = [
      {
        type: 'custom_json',
        value: {
          required_auths: requiredAuths,
          required_posting_auths: requiredPostingAuths,
          id: options.id,
          json: options.json
        }
      }
    ]

    const spinner = ora('Broadcasting custom JSON...').start()
    try {
      const client = await getClient()
      const keyType = requiredAuths.length > 0 ? 'active' : 'posting'
      const result = await client.broadcast(operations, keyType)
      spinner.succeed('Custom JSON broadcasted successfully')
      console.log(JSON.stringify(result, null, 2))
    } catch (error: any) {
      spinner.fail(error.message)
      process.exit(1)
    }
  })

const broadcastCmd = new Command('broadcast')
  .description('Broadcast raw operations')
  .argument('<operations>', 'JSON array of operations')
  .option('-k, --key-type <type>', 'Key type (posting or active)', 'posting')
  .action(async (operations: string, options) => {
    const parsedOperations: HiveOperation[] = JSON.parse(operations)

    const spinner = ora('Broadcasting operations...').start()
    try {
      const client = await getClient()
      const result = await client.broadcast(parsedOperations, options.keyType)
      spinner.succeed('Operations broadcasted successfully')
      console.log(JSON.stringify(result, null, 2))
    } catch (error: any) {
      spinner.fail(error.message)
      process.exit(1)
    }
  })

export const broadcastCommands = [voteCmd, commentCmd, transferCmd, customJsonCmd, broadcastCmd]
