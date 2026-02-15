import { Command } from 'commander'
import chalk from 'chalk'
import fs from 'fs-extra'
import inquirer from 'inquirer'
import { getConfig } from '../config.js'
import type { HiveOperation } from '../types.js'
import { createSpinner, getAccountName, getClient, parseMetadata, parseTags, parseHiveUrl, unwrapResult } from '../utils.js'

const publishCommand = new Command('publish')
  .description('Create a post or comment')
  .alias('post')
  .alias('comment')
  .requiredOption('-p, --permlink <string>', 'Permlink for the post/comment')
  .requiredOption('-t, --title <string>', 'Title (for posts)')
  .option('-b, --body <string>', 'Content body')
  .option('--body-file <path>', 'Read body from a file')
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

export const publishCommands = [
  publishCommand,
  replyCommand,
  editCommand,
  deleteCommentCommand
]
