import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import inquirer from 'inquirer'
import { readFileSync } from 'fs'
import { getConfig } from '../config.js'
import { HiveClient } from '../hive-client.js'
import type { HiveOperation } from '../types.js'
import { getAccountName, parseHiveUrl } from '../utils.js'

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

    // Resolve author/permlink from --url or explicit flags
    let author = options.author
    let permlink = options.permlink
    if (options.url) {
      const parsed = parseHiveUrl(options.url)
      if (!parsed) { console.error(chalk.red('Could not parse --url')); process.exit(1) }
      author = parsed.author; permlink = parsed.permlink
    }
    if (!author || !permlink) {
      console.error(chalk.red('Provide either --url or both --author and --permlink'))
      process.exit(1)
    }

    const weight = parseInt(options.weight) * 100 // Convert to basis points

    const operations: HiveOperation[] = [
      {
        type: 'vote',
        value: { voter, author, permlink, weight }
      }
    ]

    const spinner = ora('Broadcasting vote...').start()
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

const commentCmd = new Command('publish')
  .description('Create or edit a post/comment. Auto-detects edits if permlink already exists.')
  .alias('post')
  .alias('comment')
  .requiredOption('-p, --permlink <string>', 'Permlink for the post/comment')
  .option('-t, --title <string>', 'Title (for posts; defaults to "" for replies)', '')
  .option('-b, --body <string>', 'Content body')
  .option('--body-file <path>', 'Read content body from a file (avoids shell quoting issues)')
  .option('--parent-author <name>', 'Parent author (for comments)', '')
  .option('--parent-permlink <string>', 'Parent permlink (for comments)', '')
  .option('--parent-url <url>', 'Parent post/comment URL — replaces --parent-author and --parent-permlink')
  .option('--tags <tags>', 'Comma-separated tags', '')
  .option('--metadata <json>', 'Additional JSON metadata to merge', '{}')
  .option('--account <name>', 'Author account name (defaults to configured account)')
  .option('--burn-rewards', 'Burn all post rewards by routing them to the null account')
  .option('--beneficiaries <json>', 'JSON array of beneficiaries, e.g. \'[{"account":"null","weight":10000}]\' (weight is 0-10000 basis points)')
  .option('--wait', 'Wait for transaction confirmation before exiting')
  .action(async (options) => {
    const config = await getConfig()
    const author = getAccountName(config, options)

    if (!author) {
      console.error(chalk.red('Account not specified. Use --account, HIVE_ACCOUNT, or configure with "hive config"'))
      process.exit(1)
    }

    // Resolve parent author/permlink from --parent-url or explicit flags
    if (options.parentUrl) {
      const parsed = parseHiveUrl(options.parentUrl)
      if (!parsed) { console.error(chalk.red('Could not parse --parent-url')); process.exit(1) }
      options.parentAuthor = parsed.author
      options.parentPermlink = parsed.permlink
    }

    // Resolve body from --body or --body-file
    let body: string
    if (options.bodyFile) {
      try {
        body = readFileSync(options.bodyFile, 'utf8')
      } catch (error: any) {
        console.error(chalk.red(`Could not read body file: ${error.message}`))
        process.exit(1)
      }
    } else if (options.body) {
      body = options.body
    } else {
      console.error(chalk.red('Either --body or --body-file is required'))
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
          title: options.title || '',
          body,
          json_metadata: jsonMetadata
        }
      }
    ]

    // Build comment_options if burn-rewards or beneficiaries are requested.
    // Must be in the same transaction as the comment op.
    if (options.burnRewards || options.beneficiaries) {
      let beneficiaries: Array<{ account: string; weight: number }>

      if (options.burnRewards) {
        beneficiaries = [{ account: 'null', weight: 10000 }]
      } else {
        try {
          beneficiaries = JSON.parse(options.beneficiaries)
        } catch (error) {
          console.error(chalk.red('Invalid JSON in --beneficiaries option'))
          process.exit(1)
        }

        const totalWeight = beneficiaries.reduce((sum, b) => sum + b.weight, 0)
        if (totalWeight > 10000) {
          console.error(chalk.red(`Total beneficiary weight ${totalWeight} exceeds 10000 (100%)`))
          process.exit(1)
        }
      }

      operations.push({
        type: 'comment_options',
        value: {
          author,
          permlink: options.permlink,
          max_accepted_payout: '1000000.000 HBD',
          percent_hbd: 10000,
          allow_votes: true,
          allow_curation_rewards: true,
          extensions: [[0, { beneficiaries }]]
        }
      })
    }

    const spinner = ora('Checking if this is a new comment or an edit...').start()
    try {
      const client = await getClient()

      // Check if the comment already exists (to detect edits)
      let isEdit = false
      try {
        const existing: any = await client.call('bridge', 'get_post', { author, permlink: options.permlink })
        const existsResult = existing?.result ?? existing;
        if (existsResult && (existsResult as any).author === author && (existsResult as any).permlink === options.permlink) {
          isEdit = true
          spinner.text = 'Detected existing comment — broadcasting edit...'
        } else {
          spinner.text = 'Broadcasting new comment...'
        }
      } catch (err) {
        // Comment doesn't exist yet, treating as new
        spinner.text = 'Broadcasting new comment...'
      }

      const result: any = await client.broadcast(operations, 'posting')
      if (options.wait) {
        spinner.text = 'Waiting for confirmation...'
        await client.waitForTransaction(result?.result?.tx_id ?? result?.tx_id)
      }
      spinner.succeed(`Comment ${isEdit ? 'updated' : 'created'} successfully`)
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
  .option('--wait', 'Wait for transaction confirmation before exiting')
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
      const result: any = await client.broadcast(operations, 'active')
      if (options.wait) {
        spinner.text = 'Waiting for confirmation...'
        await client.waitForTransaction(result?.result?.tx_id ?? result?.tx_id)
      }
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

const deleteCommentCmd = new Command('delete-comment')
  .description('Delete a comment (only works if comment has received no votes)')
  .option('-a, --author <name>', 'Author of the comment')
  .option('-p, --permlink <string>', 'Permlink of the comment')
  .option('--url <url>', 'Comment URL (PeakD, HiveBlog, Ecency…) — replaces --author and --permlink')
  .option('--wait', 'Wait for transaction confirmation before exiting')
  .action(async (options) => {
    // Resolve author/permlink from --url or explicit flags
    let author = options.author
    let permlink = options.permlink
    if (options.url) {
      const parsed = parseHiveUrl(options.url)
      if (!parsed) { console.error(chalk.red('Could not parse --url')); process.exit(1) }
      author = parsed.author; permlink = parsed.permlink
    }
    if (!author || !permlink) {
      console.error(chalk.red('Provide either --url or both --author and --permlink'))
      process.exit(1)
    }

    const operations: HiveOperation[] = [
      {
        type: 'delete_comment',
        value: { author, permlink }
      }
    ]

    const spinner = ora('Deleting comment...').start()
    try {
      const client = await getClient()
      const result: any = await client.broadcast(operations, 'posting')
      if (options.wait) {
        spinner.text = 'Waiting for confirmation...'
        await client.waitForTransaction(result?.result?.tx_id ?? result?.tx_id)
      }
      spinner.succeed('Comment deleted successfully')
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

    const spinner = ora('Broadcasting operations...').start()
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

export const broadcastCommands = [voteCmd, commentCmd, deleteCommentCmd, transferCmd, customJsonCmd, broadcastCmd]
