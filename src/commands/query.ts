import { Command } from 'commander';
import ora from 'ora';
import { getConfig } from '../config.js';
import { HiveClient } from '../hive-client.js';
import { parseHiveUrl } from '../utils.js';

async function getClient(): Promise<HiveClient> {
  const config = await getConfig();
  return new HiveClient(config || { account: '' });
}

const accountCmd = new Command('account')
  .description('Get account information')
  .argument('<name>', 'Account name')
  .action(async (name: string) => {
    const spinner = ora('Fetching account...').start();
    try {
      const client = await getClient();
      const result = await client.call('condenser_api', 'get_accounts', [[name]]);
      spinner.stop();
      console.log(JSON.stringify(result, null, 2));
    } catch (error: any) {
      spinner.fail(error.message);
      process.exit(1);
    }
  });

const dynamicGlobalPropsCmd = new Command('props')
  .description('Get dynamic global properties')
  .alias('dynamic-global-properties')
  .action(async () => {
    const spinner = ora('Fetching properties...').start();
    try {
      const client = await getClient();
      const result = await client.call('database_api', 'get_dynamic_global_properties', {});
      spinner.stop();
      console.log(JSON.stringify(result, null, 2));
    } catch (error: any) {
      spinner.fail(error.message);
      process.exit(1);
    }
  });

const blockCmd = new Command('block')
  .description('Get block by number')
  .argument('<number>', 'Block number')
  .action(async (number: string) => {
    const spinner = ora(`Fetching block ${number}...`).start();
    try {
      const client = await getClient();
      const result = await client.call('block_api', 'get_block', [{ block_num: parseInt(number) }]);
      spinner.stop();
      console.log(JSON.stringify(result, null, 2));
    } catch (error: any) {
      spinner.fail(error.message);
      process.exit(1);
    }
  });

const contentCmd = new Command('content')
  .description('Get content (post/comment). Accepts a URL or author + permlink.')
  .argument('<author-or-url>', 'Author username, or a full Hive post URL (PeakD, HiveBlog, Ecency…)')
  .argument('[permlink]', 'Permlink (omit when passing a URL)')
  .action(async (authorOrUrl: string, permlink: string | undefined) => {
    const parsed = parseHiveUrl(authorOrUrl);
    const author = parsed ? parsed.author : authorOrUrl;
    const perm   = parsed ? parsed.permlink : permlink;
    if (!perm) {
      console.error('Permlink required when not passing a URL');
      process.exit(1);
    }
    const spinner = ora('Fetching content...').start();
    try {
      const client = await getClient();
      const result = await client.call('bridge', 'get_post', { author, permlink: perm });
      spinner.stop();
      console.log(JSON.stringify(result, null, 2));
    } catch (error: any) {
      spinner.fail(error.message);
      process.exit(1);
    }
  });

const callCmd = new Command('call')
  .description('Make a raw API call')
  .argument('<api>', 'API name (e.g., database_api)')
  .argument('<method>', 'Method name')
  .argument('[params]', 'JSON parameters', '{}')
  .option('--raw', 'Output full JSON-RPC envelope instead of unwrapping result')
  .action(async (api: string, method: string, params: string, options) => {
    const spinner = ora(`Calling ${api}.${method}...`).start();
    try {
      const client = await getClient();
      const parsedParams = JSON.parse(params);
      const result = await client.call(api, method, Array.isArray(parsedParams) ? parsedParams : [parsedParams]);
      spinner.stop();
      // By default unwrap the result field so piping to python/jq works without ['result']
      const output = (!options.raw && result !== null && typeof result === 'object' && 'result' in result)
        ? (result as any).result
        : result;
      console.log(JSON.stringify(output, null, 2));
    } catch (error: any) {
      spinner.fail(error.message);
      process.exit(1);
    }
  });

const repliesCmd = new Command('replies')
  .description('Get replies to a post or comment. Accepts a URL or author + permlink.')
  .argument('<author-or-url>', 'Author of the post/comment, or a full Hive post URL')
  .argument('[permlink]', 'Permlink (omit when passing a URL)')
  .action(async (authorOrUrl: string, permlink: string | undefined) => {
    const parsed = parseHiveUrl(authorOrUrl);
    const author = parsed ? parsed.author : authorOrUrl;
    const perm   = parsed ? parsed.permlink : permlink;
    if (!perm) {
      console.error('Permlink required when not passing a URL');
      process.exit(1);
    }
    const spinner = ora('Fetching replies...').start();
    try {
      const client = await getClient();
      const result = await client.call('condenser_api', 'get_content_replies', [author, perm]);
      spinner.stop();
      const replies = (result !== null && typeof result === 'object' && 'result' in result)
        ? (result as any).result
        : result;
      if (!Array.isArray(replies) || replies.length === 0) {
        console.log('No replies found.');
        return;
      }
      for (const r of replies) {
        const body = (r.body as string).replace(/\n/g, ' ').slice(0, 100);
        console.log(`@${r.author} (rep ${r.author_reputation}) | ${body}`);
      }
    } catch (error: any) {
      spinner.fail(error.message);
      process.exit(1);
    }
  });

const rcCmd = new Command('rc')
  .description('Show Resource Credits (mana) for an account')
  .argument('<name>', 'Account name')
  .action(async (name: string) => {
    const spinner = ora('Fetching RC...').start();
    try {
      const client = await getClient();
      const result: any = await client.call('rc_api', 'find_rc_accounts', { accounts: [name] });
      spinner.stop();

      const rcAccounts = result?.result?.rc_accounts ?? result?.rc_accounts;
      if (!rcAccounts?.length) {
        console.error(`No RC data found for @${name}`);
        process.exit(1);
      }

      const rc = rcAccounts[0];
      const max = BigInt(rc.max_rc);
      const stored = BigInt(rc.rc_manabar.current_mana);
      const lastUpdate = rc.rc_manabar.last_update_time;
      const elapsed = Math.floor(Date.now() / 1000) - lastUpdate;
      const REGEN_SECS = 5 * 24 * 3600; // 5 days to full
      const regenerated = max * BigInt(elapsed) / BigInt(REGEN_SECS);
      const current = stored + regenerated > max ? max : stored + regenerated;
      const percent = Number(current * 10000n / max) / 100;

      const fmt = (n: bigint) => n.toLocaleString();
      console.log(`@${name}`);
      console.log(`RC: ${percent.toFixed(2)}% (${fmt(current)} / ${fmt(max)})`);
      if (rc.delegated_rc !== '0')      console.log(`Delegated out:  ${fmt(BigInt(rc.delegated_rc))}`);
      if (rc.received_delegated_rc !== '0') console.log(`Delegated in:   ${fmt(BigInt(rc.received_delegated_rc))}`);
    } catch (error: any) {
      spinner.fail(error.message);
      process.exit(1);
    }
  });

const historyCmd = new Command('history')
  .description('Show account operation history')
  .argument('<name>', 'Account name')
  .option('-l, --limit <n>', 'Number of operations to fetch', '20')
  .option('-s, --start <n>', 'Start from sequence number (-1 = most recent)', '-1')
  .option('-f, --filter <type>', 'Filter by operation type (e.g. custom_json, comment, vote, transfer)')
  .option('--json', 'Output raw JSON instead of formatted text')
  .action(async (name: string, options) => {
    const limit = parseInt(options.limit, 10);
    const start = parseInt(options.start, 10);
    const spinner = ora(`Fetching history for @${name}...`).start();
    try {
      const client = await getClient();
      const raw: any = await client.call('condenser_api', 'get_account_history', [name, start, limit]);
      spinner.stop();

      // condenser_api returns [[seq, tx_info], ...] — unwrap result envelope if present
      const entries: [number, any][] = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.result)
        ? raw.result
        : [];

      const filtered = options.filter
        ? entries.filter(([, tx]) => tx?.op?.[0] === options.filter)
        : entries;

      if (options.json) {
        console.log(JSON.stringify(filtered, null, 2));
        return;
      }

      if (filtered.length === 0) {
        console.log(`No operations found${options.filter ? ` matching type '${options.filter}'` : ''}.`);
        return;
      }

      for (const [seq, tx] of [...filtered].reverse()) {
        const [opType, opData] = tx.op ?? [];
        const ts = tx.timestamp ?? '';
        let detail = '';

        switch (opType) {
          case 'comment':
            if (opData.parent_author === '') {
              detail = `post  "${(opData.title ?? '').slice(0, 60)}"`;
            } else {
              detail = `reply to @${opData.parent_author}/${opData.parent_permlink}`;
            }
            break;
          case 'vote':
            detail = `${opData.weight > 0 ? '+' : ''}${opData.weight / 100}% on @${opData.author}/${opData.permlink}`;
            break;
          case 'transfer':
            detail = `${opData.amount} → @${opData.to}  memo: ${(opData.memo ?? '').slice(0, 60)}`;
            break;
          case 'custom_json':
            detail = `id=${opData.id}  ${(opData.json ?? '').slice(0, 80)}`;
            break;
          case 'claim_reward_balance':
            detail = `${opData.reward_hive} ${opData.reward_hbd} ${opData.reward_vests}`;
            break;
          case 'delegate_vesting_shares':
            detail = `→ @${opData.delegatee}  ${opData.vesting_shares}`;
            break;
          default:
            detail = JSON.stringify(opData).slice(0, 100);
        }

        console.log(`#${String(seq).padStart(6)}  ${ts}  ${(opType ?? '').padEnd(22)}  ${detail}`);
      }
    } catch (error: any) {
      spinner.fail(error.message);
      process.exit(1);
    }
  });

export const queryCommands = [accountCmd, dynamicGlobalPropsCmd, blockCmd, contentCmd, callCmd, repliesCmd, rcCmd, historyCmd];
