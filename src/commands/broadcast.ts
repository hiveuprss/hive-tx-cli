import { Command } from 'commander'
import chalk from 'chalk'
import fs from 'fs-extra'
import inquirer from 'inquirer'
import { getConfig } from '../config.js'
import type { HiveOperation } from '../types.js'
import {
  createSpinner,
  getAccountName,
  getClient,
  hpToVests,
  isJsonMode,
  parseAssetAmount,
  parseMetadata,
  parseTags,
  parseHiveUrl,
  unwrapResult
} from '../utils.js'

// Helper to read content from file or stdin (supports "-" as stdin marker)
async function readContent(source: string | undefined): Promise<string> {
  if (!source) return ''

  if (source === '-') {
    // Read from stdin
    return new Promise((resolve, reject) => {
      let data = ''
      process.stdin.setEncoding('utf8')
      process.stdin.on('readable', () => {
        let chunk
        while ((chunk = process.stdin.read()) !== null) {
          data += chunk
        }
      })
      process.stdin.on('end', () => resolve(data))
      process.stdin.on('error', reject)
    })
  } else {
    // Read from file
    try {
      return await fs.readFile(source, 'utf8')
    } catch (error: any) {
      throw new Error(`Could not read file: ${error.message}`)
    }
  }
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

const publishCommand = new Command('publish')
  .description('Create a post or comment')
  .alias('post')
  .alias('comment')
  .requiredOption('-p, --permlink <string>', 'Permlink for the post/comment')
  .option('-t, --title <string>', 'Title (for posts; defaults to empty string for comments)', '')
  .option('-b, --body <string>', 'Content body')
  .option('--body-file <path>', 'Read body from a file or stdin (use "-" for stdin)')
  .option('--parent-author <name>', 'Parent author (for comments)', '')
  .option('--parent-permlink <string>', 'Parent permlink (for comments)', '')
  .option('--parent-url <url>', 'Parent post/comment URL — replaces --parent-author and --parent-permlink')
  .option('--community <name>', 'Community name (e.g., hive-12345)')
  .option('--tags <tags>', 'Comma-separated tags', '')
  .option('--metadata <json>', 'Additional JSON metadata to merge', '{}')
  .option('--decline-rewards', 'Decline author rewards')
  .option('--max-payout <amount>', 'Max accepted payout (e.g., "100.000 HBD")')
  .option('--beneficiaries <json>', 'Beneficiaries JSON (e.g., "[{\"account\":\"foo\",\"weight\":1000}]")')
  .option('--burn-rewards', 'Burn all post rewards by routing them to the null account')
  .option('--account <name>', 'Author account name (defaults to configured account)')
  .option('--wait', 'Wait for transaction confirmation before exiting')
  .action(async (options) => {
    const config = await getConfig()
    const author = getAccountName(config, options)

    if (!author) {
      console.error(chalk.red('Account not specified. Use --account, HIVE_ACCOUNT, or configure with "hive config"'))
      process.exit(1)
    }

    if (options.parentUrl) {
      const parsed = parseHiveUrl(options.parentUrl)
      if (!parsed) {
        console.error(chalk.red('Could not parse --parent-url'))
        process.exit(1)
      }
      options.parentAuthor = parsed.author
      options.parentPermlink = parsed.permlink
    }

    let body = options.body
    if (options.bodyFile) {
      try {
        body = await readContent(options.bodyFile)
      } catch (error: any) {
        console.error(chalk.red(`Failed to read body file: ${error.message}`))
        process.exit(1)
      }
    }

    if (!body) {
      console.error(chalk.red('Body is required. Use --body or --body-file.'))
      process.exit(1)
    }

    let userMetadata: Record<string, unknown> = {}
    if (options.metadata && options.metadata !== '{}') {
      try {
        userMetadata = JSON.parse(options.metadata)
      } catch {
        console.error(chalk.red('Invalid JSON in metadata option'))
        process.exit(1)
      }
    }

    const metadata: Record<string, unknown> = { ...userMetadata }
    if (options.tags) {
      metadata.tags = parseTags(options.tags)
    }

    const jsonMetadata = Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : ''
    const parentPermlink = options.community || options.parentPermlink || options.permlink

    const operations: HiveOperation[] = [
      {
        type: 'comment',
        value: {
          parent_author: options.parentAuthor || '',
          parent_permlink: parentPermlink,
          author,
          permlink: options.permlink,
          title: options.title,
          body,
          json_metadata: jsonMetadata
        }
      }
    ]

    const wantsCommentOptions = Boolean(options.declineRewards || options.maxPayout || options.beneficiaries || options.burnRewards)
    if (wantsCommentOptions) {
      let extensions: unknown[] = []
      if (options.burnRewards) {
        extensions = [[0, { beneficiaries: [{ account: 'null', weight: 10000 }] }]]
      } else if (options.beneficiaries) {
        try {
          const beneficiaries = JSON.parse(options.beneficiaries)
          if (!Array.isArray(beneficiaries)) {
            throw new Error('Beneficiaries must be an array')
          }
          extensions = [[0, { beneficiaries }]]
        } catch (error: any) {
          console.error(chalk.red(`Invalid JSON in beneficiaries option: ${error.message}`))
          process.exit(1)
        }
      }

      const maxAcceptedPayout = options.maxPayout || (options.declineRewards ? '0.000 HBD' : '1000000.000 HBD')

      operations.push({
        type: 'comment_options',
        value: {
          author,
          permlink: options.permlink,
          max_accepted_payout: maxAcceptedPayout,
          percent_hbd: 10000,
          allow_votes: true,
          allow_curation_rewards: true,
          extensions
        }
      })
    }

    const spinner = createSpinner('Checking if this is a new comment or an edit...').start()
    try {
      const client = await getClient()
      let isEdit = false
      try {
        const existing: any = await client.call('bridge', 'get_post', { author, permlink: options.permlink })
        const existsResult = existing?.result ?? existing
        if (existsResult && existsResult.author === author && existsResult.permlink === options.permlink) {
          isEdit = true
          spinner.text = 'Detected existing comment — broadcasting edit...'
        } else {
          spinner.text = 'Broadcasting new comment...'
        }
      } catch (err) {
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

const replyCommand = new Command('reply')
  .description('Reply to a post or comment')
  .argument('<author>', 'Parent author')
  .argument('<permlink>', 'Parent permlink')
  .option('-b, --body <string>', 'Reply body')
  .option('--body-file <path>', 'Read body from a file')
  .option('--decline-rewards', 'Decline author rewards')
  .option('--account <name>', 'Reply author account name (defaults to configured account)')
  .option('--wait', 'Wait for transaction confirmation before exiting')
  .action(async (parentAuthor: string, parentPermlink: string, options) => {
    const config = await getConfig()
    const author = getAccountName(config, options)

    if (!author) {
      console.error(chalk.red('Account not specified. Use --account, HIVE_ACCOUNT, or configure with "hive config"'))
      process.exit(1)
    }

    let body = options.body
    if (options.bodyFile) {
      try {
        body = await fs.readFile(options.bodyFile, 'utf8')
      } catch (error: any) {
        console.error(chalk.red(`Failed to read body file: ${error.message}`))
        process.exit(1)
      }
    }

    if (!body) {
      console.error(chalk.red('Body is required. Use --body or --body-file.'))
      process.exit(1)
    }

    const permlink = `re-${parentAuthor}-${Date.now()}`

    const operations: HiveOperation[] = [
      {
        type: 'comment',
        value: {
          parent_author: parentAuthor,
          parent_permlink: parentPermlink,
          author,
          permlink,
          title: '',
          body,
          json_metadata: ''
        }
      }
    ]

    if (options.declineRewards) {
      operations.push({
        type: 'comment_options',
        value: {
          author,
          permlink,
          max_accepted_payout: '0.000 HBD',
          percent_hbd: 10000,
          allow_votes: true,
          allow_curation_rewards: true,
          extensions: []
        }
      })
    }

    const spinner = createSpinner('Broadcasting reply...').start()
    try {
      const client = await getClient()
      const result: any = await client.broadcast(operations, 'posting')
      if (options.wait) {
        spinner.text = 'Waiting for confirmation...'
        await client.waitForTransaction(result?.result?.tx_id ?? result?.tx_id)
      }
      spinner.succeed('Reply broadcasted successfully')
      console.log(JSON.stringify(result, null, 2))
    } catch (error: any) {
      spinner.fail(error.message)
      process.exit(1)
    }
  })

const editCommand = new Command('edit')
  .description('Edit a post or comment')
  .argument('<author>', 'Author username')
  .argument('<permlink>', 'Permlink')
  .option('-b, --body <string>', 'Updated body content')
  .option('--body-file <path>', 'Read body from a file')
  .option('-t, --title <string>', 'Updated title (defaults to existing title)')
  .option('--tags <tags>', 'Comma-separated tags (defaults to existing tags)')
  .option('--account <name>', 'Author account name (defaults to configured account)')
  .action(async (author: string, permlink: string, options) => {
    const config = await getConfig()
    const account = getAccountName(config, options)

    if (!account) {
      console.error(chalk.red('Account not specified. Use --account, HIVE_ACCOUNT, or configure with "hive config"'))
      process.exit(1)
    }

    let body = options.body
    if (options.bodyFile) {
      try {
        body = await fs.readFile(options.bodyFile, 'utf8')
      } catch (error: any) {
        console.error(chalk.red(`Failed to read body file: ${error.message}`))
        process.exit(1)
      }
    }

    if (!body) {
      console.error(chalk.red('Body is required. Use --body or --body-file.'))
      process.exit(1)
    }

    const fetchSpinner = createSpinner('Fetching existing post...').start()
    let post: any
    try {
      const client = await getClient()
      const response = await client.call('bridge', 'get_post', { author, permlink })
      post = unwrapResult(response)
      fetchSpinner.stop()
    } catch (error: any) {
      fetchSpinner.fail(error.message)
      process.exit(1)
    }

    const existingMetadata = parseMetadata(post?.json_metadata)
    const existingTags = Array.isArray(existingMetadata.tags)
      ? (existingMetadata.tags as string[])
      : Array.isArray(post?.tags)
        ? (post.tags as string[])
        : []

    const updatedMetadata: Record<string, unknown> = { ...existingMetadata }
    if (options.tags) {
      updatedMetadata.tags = parseTags(options.tags)
    } else if (existingTags.length > 0) {
      updatedMetadata.tags = existingTags
    }

    const jsonMetadata = Object.keys(updatedMetadata).length > 0 ? JSON.stringify(updatedMetadata) : ''

    const operations: HiveOperation[] = [
      {
        type: 'comment',
        value: {
          parent_author: post.parent_author || '',
          parent_permlink: post.parent_permlink || '',
          author,
          permlink,
          title: options.title || post.title || '',
          body,
          json_metadata: jsonMetadata
        }
      }
    ]

    const spinner = createSpinner('Broadcasting edit...').start()
    try {
      const client = await getClient()
      const result = await client.broadcast(operations, 'posting')
      spinner.succeed('Edit broadcasted successfully')
      console.log(JSON.stringify(result, null, 2))
    } catch (error: any) {
      spinner.fail(error.message)
      process.exit(1)
    }
  })

const deleteCommentCommand = new Command('delete-comment')
  .description('Delete a comment (only works if comment has received no votes)')
  .option('-a, --author <name>', 'Author of the comment')
  .option('-p, --permlink <string>', 'Permlink of the comment')
  .option('--url <url>', 'Comment URL (PeakD, HiveBlog, Ecency…) — replaces --author and --permlink')
  .option('--wait', 'Wait for transaction confirmation before exiting')
  .action(async (options) => {
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

    const operations: HiveOperation[] = [
      {
        type: 'delete_comment',
        value: { author, permlink }
      }
    ]

    const spinner = createSpinner('Deleting comment...').start()
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

const communityCommand = new Command('community')
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

communityCommand.addCommand(communitySearchCmd)
communityCommand.addCommand(communityInfoCmd)
communityCommand.addCommand(communitySubscribeCmd)
communityCommand.addCommand(communityUnsubscribeCmd)
communityCommand.addCommand(communitySubscribersCmd)

const claimCommand = new Command('claim')
  .description('Claim pending rewards')
  .option('--account <name>', 'Account name (defaults to configured account)')
  .action(async (options) => {
    const config = await getConfig()
    const account = getAccountName(config, options)

    if (!account) {
      console.error(chalk.red('Account not specified. Use --account, HIVE_ACCOUNT, or configure with "hive config"'))
      process.exit(1)
    }

    const fetchSpinner = createSpinner('Fetching account rewards...').start()
    let accountInfo: any
    try {
      const client = await getClient()
      const response = await client.call('condenser_api', 'get_accounts', [[account]])
      const accounts = unwrapResult(response) as any
      accountInfo = Array.isArray(accounts) ? accounts[0] : undefined
      fetchSpinner.stop()
    } catch (error: any) {
      fetchSpinner.fail(error.message)
      process.exit(1)
    }

    const rewardHive = accountInfo?.reward_hive_balance || '0.000 HIVE'
    const rewardHbd = accountInfo?.reward_hbd_balance || '0.000 HBD'
    const rewardVests = accountInfo?.reward_vesting_balance || '0.000000 VESTS'

    const hasRewards =
      parseAssetAmount(rewardHive) > 0 ||
      parseAssetAmount(rewardHbd) > 0 ||
      parseAssetAmount(rewardVests) > 0

    if (!hasRewards) {
      if (process.env.HIVE_JSON_OUTPUT === '1') {
        console.log(JSON.stringify({ message: 'No pending rewards to claim.' }, null, 2))
      } else {
        console.log(chalk.yellow('No pending rewards to claim.'))
      }
      return
    }

    const operations: HiveOperation[] = [
      {
        type: 'claim_reward_balance',
        value: {
          account,
          reward_hive: rewardHive,
          reward_hbd: rewardHbd,
          reward_vesting: rewardVests
        }
      }
    ]

    const spinner = createSpinner('Broadcasting claim...').start()
    try {
      const client = await getClient()
      const result = await client.broadcast(operations, 'posting')
      spinner.succeed('Rewards claimed successfully')
      console.log(JSON.stringify(result, null, 2))
    } catch (error: any) {
      spinner.fail(error.message)
      process.exit(1)
    }
  })

const delegateCommand = new Command('delegate')
  .description('Delegate HP to another account')
  .argument('<to>', 'Account to delegate to')
  .argument('<amount>', 'Amount to delegate (e.g., "100 HP")')
  .option('--account <name>', 'Delegator account name (defaults to configured account)')
  .action(async (to: string, amount: string, options) => {
    const config = await getConfig()
    const delegator = getAccountName(config, options)

    if (!delegator) {
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

    const amountParts = amount.split(' ')
    const hpAmount = parseFloat(amountParts[0] ?? '')
    const unit = amountParts[1]?.toUpperCase()

    if (!Number.isFinite(hpAmount) || unit !== 'HP') {
      console.error(chalk.red('Amount must be in HP, e.g., "100 HP".'))
      process.exit(1)
    }

    const propsSpinner = createSpinner('Fetching global properties...').start()
    let props: any
    try {
      const client = await getClient()
      const response = await client.call('database_api', 'get_dynamic_global_properties', {})
      props = unwrapResult(response)
      propsSpinner.stop()
    } catch (error: any) {
      propsSpinner.fail(error.message)
      process.exit(1)
    }

    const vestingShares = hpToVests(hpAmount, props)

    const operations: HiveOperation[] = [
      {
        type: 'delegate_vesting_shares',
        value: {
          delegator,
          delegatee: to,
          vesting_shares: vestingShares
        }
      }
    ]

    const spinner = createSpinner('Broadcasting delegation...').start()
    try {
      const client = await getClient()
      const result = await client.broadcast(operations, 'active')
      spinner.succeed('Delegation broadcasted successfully')
      console.log(JSON.stringify(result, null, 2))
    } catch (error: any) {
      spinner.fail(error.message)
      process.exit(1)
    }
  })

const profileCommand = new Command('profile')
  .description('Manage profile metadata')

const profileUpdateCmd = new Command('update')
  .description('Update profile metadata')
  .option('--name <name>', 'Profile name')
  .option('--about <text>', 'Profile about text')
  .option('--profile-image <url>', 'Profile image URL')
  .option('--cover-image <url>', 'Cover image URL')
  .option('--website <url>', 'Website URL')
  .option('--location <text>', 'Location')
  .option('--account <name>', 'Account name (defaults to configured account)')
  .action(async (options) => {
    const config = await getConfig()
    const account = getAccountName(config, options)

    if (!account) {
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

    const updates: Record<string, string> = {}
    if (options.name) updates.name = options.name
    if (options.about) updates.about = options.about
    if (options.profileImage) updates.profile_image = options.profileImage
    if (options.coverImage) updates.cover_image = options.coverImage
    if (options.website) updates.website = options.website
    if (options.location) updates.location = options.location

    if (Object.keys(updates).length === 0) {
      console.error(chalk.red('No profile fields provided.'))
      process.exit(1)
    }

    const fetchSpinner = createSpinner('Fetching existing profile...').start()
    let existingMetadata: Record<string, unknown> = {}

    try {
      const client = await getClient()
      const response = await client.call('condenser_api', 'get_accounts', [[account]])
      const accounts = unwrapResult(response) as any
      const accountInfo = Array.isArray(accounts) ? accounts[0] : undefined
      existingMetadata = parseMetadata(accountInfo?.posting_json_metadata)
      fetchSpinner.stop()
    } catch (error: any) {
      fetchSpinner.fail(error.message)
      process.exit(1)
    }

    const existingProfile = typeof existingMetadata.profile === 'object' && existingMetadata.profile !== null
      ? (existingMetadata.profile as Record<string, unknown>)
      : {}

    const updatedProfile = {
      ...existingProfile,
      ...updates
    }

    const updatedMetadata = {
      ...existingMetadata,
      profile: updatedProfile
    }

    const operations: HiveOperation[] = [
      {
        type: 'account_update2',
        value: {
          account,
          json_metadata: '',
          posting_json_metadata: JSON.stringify(updatedMetadata),
          extensions: []
        }
      }
    ]

    const spinner = createSpinner('Broadcasting profile update...').start()
    try {
      const client = await getClient()
      const result = await client.broadcast(operations, 'active')
      spinner.succeed('Profile update broadcasted successfully')
      console.log(JSON.stringify(result, null, 2))
    } catch (error: any) {
      spinner.fail(error.message)
      process.exit(1)
    }
  })

profileCommand.addCommand(profileUpdateCmd)

const transferCommand = new Command('transfer')
  .description('Transfer HIVE or HBD')
  .requiredOption('-t, --to <name>', 'Recipient account')
  .requiredOption('-a, --amount <string>', 'Amount (e.g., "1.000 HIVE")')
  .option('-m, --memo <string>', 'Transfer memo', '')
  .option('--memo-file <path>', 'Read transfer memo from a file or stdin (use "-" for stdin)')
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

    // Resolve memo from --memo or --memo-file
    let memo: string
    try {
      if (options.memoFile) {
        memo = await readContent(options.memoFile)
      } else if (options.memo) {
        memo = options.memo
      } else {
        memo = ''
      }
    } catch (error: any) {
      console.error(chalk.red(`Error reading memo: ${error.message}`))
      process.exit(1)
    }

    const operations: HiveOperation[] = [
      {
        type: 'transfer',
        value: {
          from,
          to: options.to,
          amount: options.amount,
          memo: memo
        }
      }
    ]

    const spinner = createSpinner('Broadcasting transfer...').start()
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

const voteCommand = new Command('vote')
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

const customJsonCommand = new Command('custom-json')
  .description('Broadcast custom JSON operation')
  .requiredOption('-i, --id <string>', 'Operation ID')
  .option('-j, --json <string>', 'JSON payload')
  .option('--json-file <path>', 'Read JSON payload from a file or stdin (use "-" for stdin)')
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

    // Resolve JSON from --json or --json-file
    let json: string
    try {
      if (options.jsonFile) {
        json = await readContent(options.jsonFile)
      } else if (options.json) {
        json = options.json
      } else {
        console.error(chalk.red('Either --json or --json-file is required'))
        process.exit(1)
      }
    } catch (error: any) {
      console.error(chalk.red(`Error reading JSON: ${error.message}`))
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
          json: json
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

const broadcastCommand = new Command('broadcast')
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
  publishCommand,
  replyCommand,
  editCommand,
  deleteCommentCommand,
  followCommand,
  unfollowCommand,
  muteCommand,
  unmuteCommand,
  reblogCommand,
  communityCommand,
  profileCommand,
  claimCommand,
  delegateCommand,
  transferCommand,
  voteCommand,
  customJsonCommand,
  broadcastCommand
]
