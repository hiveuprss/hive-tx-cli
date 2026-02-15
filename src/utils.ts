import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import ora from 'ora';
import chalk from 'chalk';
import { getConfig } from './config.js';
import { HiveClient } from './hive-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function findPackageJson(): string {
  // Try relative paths from current file
  const paths = [
    join(__dirname, '../package.json'),     // From dist/
    join(__dirname, '../../package.json'),   // From src/
    join(process.cwd(), 'package.json'),     // From cwd
  ];
  
  for (const path of paths) {
    if (existsSync(path)) {
      return path;
    }
  }
  
  throw new Error('Could not find package.json');
}

export const packageJson = JSON.parse(
  readFileSync(findPackageJson(), 'utf-8')
);

export function getAccountName(config: any, options: any): string {
  return options.account || config?.account || process.env.HIVE_ACCOUNT;
}

/**
 * Parse a Hive post/comment URL into { author, permlink }.
 * Supports PeakD, HiveBlog, Ecency, and any URL with /@author/permlink in the path.
 * Returns null if the input is not a recognisable URL.
 */
export function parseHiveUrl(input: string): { author: string; permlink: string } | null {
  if (!input.startsWith('http')) return null;
  try {
    const url = new URL(input);
    const match = url.pathname.match(/\/\@([a-z0-9._-]+)\/([a-z0-9-]+)/);
    if (match) return { author: match[1]!, permlink: match[2]! };
  } catch {
    // not a valid URL
  }
  return null;
}

export function isJsonMode(): boolean {
  return process.env.HIVE_JSON_OUTPUT === '1';
}

export function createSpinner(text: string) {
  if (isJsonMode()) {
    return {
      start: () => ({ succeed: () => {}, fail: () => {}, stop: () => {} }),
      succeed: () => {},
      fail: () => {},
      stop: () => {}
    };
  }
  return ora(text);
}

export async function getClient(options: { requireConfig?: boolean } = {}): Promise<HiveClient> {
  const config = await getConfig();
  const requireConfig = options.requireConfig !== false;

  if (!config && requireConfig) {
    console.error(chalk.red('Configuration not found. Run "hive config" or set HIVE_ACCOUNT and key env vars.'));
    process.exit(1);
  }

  return new HiveClient(config || { account: '' });
}

export function parseMetadata(raw: unknown): Record<string, unknown> {
  if (!raw) {
    return {};
  }

  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  if (typeof raw === 'object') {
    return raw as Record<string, unknown>;
  }

  return {};
}

export function parseTags(tags: string | undefined): string[] {
  if (!tags) {
    return [];
  }

  return tags.split(',').map((tag) => tag.trim()).filter(Boolean);
}

export function unwrapResult<T>(result: any): T {
  return (result && typeof result === 'object' && 'result' in result)
    ? (result as any).result
    : result;
}

export function parseAssetAmount(amount: any): number {
  if (typeof amount === 'number') {
    return amount;
  }

  if (amount && typeof amount === 'object' && 'amount' in amount) {
    const numeric = parseFloat(String((amount as any).amount));
    return Number.isFinite(numeric) ? numeric : 0;
  }

  if (!amount) {
    return 0;
  }

  const numeric = parseFloat(String(amount).split(' ')[0] ?? '0');
  return Number.isFinite(numeric) ? numeric : 0;
}

export function hpToVests(hp: number, props: any): string {
  const totalVestingFundHive = parseAssetAmount(props.total_vesting_fund_hive);
  const totalVestingShares = parseAssetAmount(props.total_vesting_shares);

  if (!totalVestingFundHive || !totalVestingShares) {
    return '0.000000 VESTS';
  }

  const vests = (hp * totalVestingShares) / totalVestingFundHive;
  return `${vests.toFixed(6)} VESTS`;
}
