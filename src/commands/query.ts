import { Command } from 'commander';
import ora from 'ora';
import { getConfig } from '../config.js';
import { HiveClient } from '../hive-client.js';

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
  .description('Get content (post/comment)')
  .argument('<author>', 'Author username')
  .argument('<permlink>', 'Permlink')
  .action(async (author: string, permlink: string) => {
    const spinner = ora('Fetching content...').start();
    try {
      const client = await getClient();
      const result = await client.call('bridge', 'get_post', { author, permlink });
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
  .description('Get replies to a post or comment')
  .argument('<author>', 'Author of the post/comment')
  .argument('<permlink>', 'Permlink of the post/comment')
  .action(async (author: string, permlink: string) => {
    const spinner = ora('Fetching replies...').start();
    try {
      const client = await getClient();
      const result = await client.call('condenser_api', 'get_content_replies', [author, permlink]);
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

export const queryCommands = [accountCmd, dynamicGlobalPropsCmd, blockCmd, contentCmd, callCmd, repliesCmd];
