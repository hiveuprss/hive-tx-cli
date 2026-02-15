import { Command } from 'commander'
import chalk from 'chalk'
import { getConfig } from '../config.js'
import type { HiveOperation } from '../types.js'
import { createSpinner, getAccountName, getClient, parseHiveUrl } from '../utils.js'

const voteCmd = new Command('vote')
  .description('Vote on a post or comment')
  .option('-a, --author <name>', 'Author of the content')
  .option('-p, --permlink <string>', 'Permlink of the content')
  .option('--url <url>', 'Post URL (PeakD, HiveBlog, Ecency…) — replaces --author and --permlink')
  .requiredOption('-w, --weight <number>', 'Vote weight (1-100)', '100')
  .option('--account <name>', 'Voter account name (defaults to configured account)')
  .option('--wait', 'Wait for transaction confirmation before exiting')
  .action(async (options) => {
    const config = await getConfig()
    const voter = getAccountName(config, options)

    if (!voter) {
      console.error(chalk.red('Account not specified. Use --account, HIVE_ACCOUNT, or configure with "hive config"'))
      process.exit(1)
    }

    let author = options.author
    let permlink = options.permlink
    if (options.url) {
      const parsed = parseHiveUrl(options.url)
      if (!parsed) {
        console.error(chalk.red('Could not parse --url'))
        process.exit(1)
      }
      author = parsed.author
      permlink = parsed.permlink
    }
    if (!author || !permlink) {
      console.error(chalk.red('Provide either --url or both --author and --permlink'))
      process.exit(1)
    }

    const weight = parseInt(options.weight) * 100

    const operations: HiveOperation[] = [
      {
        type: 'vote',
        value: {
          voter,
          author,
          permlink,
          weight
        }
      }
    ]

    const spinner = createSpinner('Broadcasting vote...').start()
    try {
      const client = await getClient()
      const result: any = await client.broadcast(operations, 'posting')
      if (options.wait) {
        spinner.text = 'Waiting for confirmation...'
        await client.waitForTransaction(result?.result?.tx_id ?? result?.tx_id)
      }
      spinner.succeed('Vote broadcasted successfully')
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
  .option('--wait', 'Wait for transaction confirmation before exiting')
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

    const spinner = createSpinner('Broadcasting custom JSON...').start()
    try {
      const client = await getClient()
      const keyType = requiredAuths.length > 0 ? 'active' : 'posting'
      const result: any = await client.broadcast(operations, keyType)
      if (options.wait) {
        spinner.text = 'Waiting for confirmation...'
        await client.waitForTransaction(result?.result?.tx_id ?? result?.tx_id)
      }
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
  .option('--wait', 'Wait for transaction confirmation before exiting')
  .action(async (operations: string, options) => {
    const parsedOperations: HiveOperation[] = JSON.parse(operations)

    const spinner = createSpinner('Broadcasting operations...').start()
    try {
      const client = await getClient()
      const result: any = await client.broadcast(parsedOperations, options.keyType)
      if (options.wait) {
        spinner.text = 'Waiting for confirmation...'
        await client.waitForTransaction(result?.result?.tx_id ?? result?.tx_id)
      }
      spinner.succeed('Operations broadcasted successfully')
      console.log(JSON.stringify(result, null, 2))
    } catch (error: any) {
      spinner.fail(error.message)
      process.exit(1)
    }
  })

export const broadcastCommands = [
  voteCmd,
  customJsonCmd,
  broadcastCmd
]
