import { Command } from 'commander'
import { createSpinner, getClient, isJsonMode, parseAssetAmount, parseHiveUrl, unwrapResult } from '../utils.js'

const accountCommand = new Command('account')
  .description('Get account information')
  .argument('<name>', 'Account name')
  .action(async (name: string) => {
    const spinner = createSpinner('Fetching account...').start()
    try {
      const client = await getClient({ requireConfig: false })
      const result = await client.call('condenser_api', 'get_accounts', [[name]])
      spinner.stop()
      console.log(JSON.stringify(result, null, 2))
    } catch (error: any) {
      spinner.fail(error.message)
      process.exit(1)
    }
  })

const balanceCommand = new Command('balance')
  .description('Get account balances')
  .argument('<account>', 'Account name')
  .action(async (account: string) => {
    const spinner = createSpinner('Fetching balances...').start()
    try {
      const client = await getClient({ requireConfig: false })
      const [accountResult, propsResult] = await Promise.all([
        client.call('condenser_api', 'get_accounts', [[account]]),
        client.call('database_api', 'get_dynamic_global_properties', {})
      ])

      spinner.stop()

      const props = unwrapResult(propsResult) as any
      const accountData = unwrapResult(accountResult) as any
      const accounts = Array.isArray(accountData) ? accountData : []
      const accountInfo = accounts[0]

      if (isJsonMode()) {
        console.log(JSON.stringify({ account: accountResult, props: propsResult }, null, 2))
        return
      }

      if (!accountInfo) {
        console.log('Account not found.')
        return
      }

      const vestingShares = parseAssetAmount(accountInfo.vesting_shares)
      const totalVestingFundHive = parseAssetAmount(props.total_vesting_fund_hive)
      const totalVestingShares = parseAssetAmount(props.total_vesting_shares)
      const hp = totalVestingShares ? (vestingShares * totalVestingFundHive) / totalVestingShares : 0

      console.log(`Account: ${accountInfo.name}`)
      console.log(`  HIVE: ${accountInfo.balance}`)
      console.log(`  HBD: ${accountInfo.hbd_balance}`)
      console.log(`  HP: ${hp.toFixed(3)} HP`)
      console.log(`  Savings HIVE: ${accountInfo.savings_balance}`)
      console.log(`  Savings HBD: ${accountInfo.savings_hbd_balance}`)
      console.log(`  Pending Rewards: ${accountInfo.reward_hive_balance} | ${accountInfo.reward_hbd_balance} | ${accountInfo.reward_vesting_balance}`)
    } catch (error: any) {
      spinner.fail(error.message)
      process.exit(1)
    }
  })

const blockCommand = new Command('block')
  .description('Get block by number')
  .argument('<number>', 'Block number')
  .action(async (number: string) => {
    const spinner = createSpinner(`Fetching block ${number}...`).start()
    try {
      const client = await getClient({ requireConfig: false })
      const result = await client.call('block_api', 'get_block', [{ block_num: parseInt(number) }])
      spinner.stop()
      console.log(JSON.stringify(result, null, 2))
    } catch (error: any) {
      spinner.fail(error.message)
      process.exit(1)
    }
  })

const callCommand = new Command('call')
  .description('Make a raw API call')
  .argument('<api>', 'API name (e.g., database_api)')
  .argument('<method>', 'Method name')
  .argument('[params]', 'JSON parameters', '{}')
  .option('--raw', 'Output full JSON-RPC envelope instead of unwrapping result')
  .action(async (api: string, method: string, params: string, options) => {
    const spinner = createSpinner(`Calling ${api}.${method}...`).start()
    try {
      const client = await getClient({ requireConfig: false })
      const parsedParams = JSON.parse(params)
      const result = await client.call(api, method, Array.isArray(parsedParams) ? parsedParams : [parsedParams])
      spinner.stop()
      const output = (!options.raw && result !== null && typeof result === 'object' && 'result' in result)
        ? (result as any).result
        : result
      console.log(JSON.stringify(output, null, 2))
    } catch (error: any) {
      spinner.fail(error.message)
      process.exit(1)
    }
  })

function formatBodyPreview(body: string | undefined, length = 100): string {
  if (!body) {
    return ''
  }
  const trimmed = body.replace(/\s+/g, ' ').trim()
  if (trimmed.length <= length) {
    return trimmed
  }
  return `${trimmed.slice(0, length)}…`
}

const contentCommand = new Command('content')
  .description('Get content (post/comment). Accepts a URL or author + permlink.')
  .argument('<author-or-url>', 'Author username, or a full Hive post URL (PeakD, HiveBlog, Ecency…)')
  .argument('[permlink]', 'Permlink (omit when passing a URL)')
  .action(async (authorOrUrl: string, permlink: string | undefined) => {
    const parsed = parseHiveUrl(authorOrUrl)
    const author = parsed ? parsed.author : authorOrUrl
    const perm = parsed ? parsed.permlink : permlink
    if (!perm) {
      console.error('Permlink required when not passing a URL')
      process.exit(1)
    }

    const spinner = createSpinner('Fetching content...').start()
    try {
      const client = await getClient({ requireConfig: false })
      const result = await client.call('bridge', 'get_post', { author, permlink: perm })
      spinner.stop()
      console.log(JSON.stringify(result, null, 2))
    } catch (error: any) {
      spinner.fail(error.message)
      process.exit(1)
    }
  })

const repliesCommand = new Command('replies')
  .description('Get replies to a post or comment. Accepts a URL or author + permlink.')
  .argument('<author-or-url>', 'Author of the post/comment, or a full Hive post URL')
  .argument('[permlink]', 'Permlink (omit when passing a URL)')
  .action(async (authorOrUrl: string, permlink: string | undefined) => {
    const parsed = parseHiveUrl(authorOrUrl)
    const author = parsed ? parsed.author : authorOrUrl
    const perm = parsed ? parsed.permlink : permlink
    if (!perm) {
      console.error('Permlink required when not passing a URL')
      process.exit(1)
    }

    const spinner = createSpinner('Fetching replies...').start()
    try {
      const client = await getClient({ requireConfig: false })
      const rawResult = await client.call('condenser_api', 'get_content_replies', [author, perm])
      const replies = unwrapResult(rawResult) as any[]
      spinner.stop()

      if (!Array.isArray(replies) || replies.length === 0) {
        console.log('No replies found.')
        return
      }

      for (const reply of replies) {
        const body = (reply.body as string).replace(/\n/g, ' ').slice(0, 100)
        console.log(`@${reply.author} (rep ${reply.author_reputation}) | ${body}`)
      }
    } catch (error: any) {
      spinner.fail(error.message)
      process.exit(1)
    }
  })

const feedCommand = new Command('feed')
  .description('Get recent posts by an account')
  .argument('<account>', 'Account name')
  .option('-l, --limit <number>', 'Number of posts to fetch', '10')
  .action(async (account: string, options) => {
    const limit = parseInt(options.limit, 10) || 10
    const spinner = createSpinner('Fetching account posts...').start()
    try {
      const client = await getClient({ requireConfig: false })
      const rawResult = await client.call('bridge', 'get_account_posts', { account, sort: 'posts', limit })
      const result = unwrapResult(rawResult)
      spinner.stop()

      if (isJsonMode()) {
        console.log(JSON.stringify(rawResult, null, 2))
        return
      }

      const posts = Array.isArray(result) ? result : []
      if (posts.length === 0) {
        console.log('No posts found.')
        return
      }

      for (const post of posts) {
        const payout = post.payout || post.pending_payout_value || post.total_payout_value || post.curator_payout_value || '0.000 HBD'
        const votes = post.stats?.total_votes ?? post.active_votes?.length ?? post.vote_count ?? 0
        console.log(`${post.title || '(Untitled)'} · @${post.author}/${post.permlink}`)
        console.log(`  Created: ${post.created} | Payout: ${payout} | Votes: ${votes}`)
      }
    } catch (error: any) {
      spinner.fail(error.message)
      process.exit(1)
    }
  })

const propsCommand = new Command('props')
  .description('Get dynamic global properties')
  .alias('dynamic-global-properties')
  .action(async () => {
    const spinner = createSpinner('Fetching properties...').start()
    try {
      const client = await getClient({ requireConfig: false })
      const result = await client.call('database_api', 'get_dynamic_global_properties', {})
      spinner.stop()
      console.log(JSON.stringify(result, null, 2))
    } catch (error: any) {
      spinner.fail(error.message)
      process.exit(1)
    }
  })

function formatPct(value: number): string {
  return `${value.toFixed(2)}%`
}

function formatRecovery(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 'Full'
  }

  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const parts = []
  if (days) parts.push(`${days}d`)
  if (hours) parts.push(`${hours}h`)
  if (minutes) parts.push(`${minutes}m`)
  return parts.length > 0 ? parts.join(' ') : 'Less than 1m'
}

const rcCommand = new Command('rc')
  .description('Show Resource Credits (mana) for an account')
  .argument('<name>', 'Account name')
  .action(async (name: string) => {
    const spinner = createSpinner('Fetching RC...').start()
    try {
      const client = await getClient({ requireConfig: false })
      const result: any = await client.call('rc_api', 'find_rc_accounts', { accounts: [name] })
      spinner.stop()

      if (isJsonMode()) {
        console.log(JSON.stringify(result, null, 2))
        return
      }

      const rcAccounts = result?.result?.rc_accounts ?? result?.rc_accounts
      if (!rcAccounts?.length) {
        console.error(`No RC data found for @${name}`)
        process.exit(1)
      }

      const rc = rcAccounts[0]
      const max = BigInt(rc.max_rc)
      const stored = BigInt(rc.rc_manabar.current_mana)
      const lastUpdate = rc.rc_manabar.last_update_time
      const elapsed = Math.floor(Date.now() / 1000) - lastUpdate
      const REGEN_SECS = 5 * 24 * 3600
      const regenerated = max * BigInt(elapsed) / BigInt(REGEN_SECS)
      const current = stored + regenerated > max ? max : stored + regenerated
      const percent = Number(current * 10000n / max) / 100

      const fmt = (n: bigint) => n.toLocaleString()
      console.log(`@${name}`)
      console.log(`RC: ${percent.toFixed(2)}% (${fmt(current)} / ${fmt(max)})`)
      if (rc.delegated_rc !== '0') console.log(`Delegated out:  ${fmt(BigInt(rc.delegated_rc))}`)
      if (rc.received_delegated_rc !== '0') console.log(`Delegated in:   ${fmt(BigInt(rc.received_delegated_rc))}`)
    } catch (error: any) {
      spinner.fail(error.message)
      process.exit(1)
    }
  })

export const queryCommands = [
  accountCommand,
  propsCommand,
  blockCommand,
  contentCommand,
  repliesCommand,
  feedCommand,
  balanceCommand,
  rcCommand,
  callCommand
]
