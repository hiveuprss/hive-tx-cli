import { Command } from 'commander'
import chalk from 'chalk'
import inquirer from 'inquirer'
import { getConfig } from '../config.js'
import type { HiveOperation } from '../types.js'
import { createSpinner, getAccountName, getClient, hpToVests, parseAssetAmount, parseMetadata, unwrapResult } from '../utils.js'

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

export const accountCommands = [
  profileCommand,
  transferCommand,
  claimCommand,
  delegateCommand
]
