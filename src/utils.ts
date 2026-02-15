import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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
 *
 * Examples:
 *   https://peakd.com/introduceyourself/@alice/my-post  → { author: 'alice', permlink: 'my-post' }
 *   https://hive.blog/hive-174578/@alice/my-post        → { author: 'alice', permlink: 'my-post' }
 *   https://ecency.com/hive-174578/@alice/my-post       → { author: 'alice', permlink: 'my-post' }
 */
export function parseHiveUrl(input: string): { author: string; permlink: string } | null {
  if (!input.startsWith('http')) return null;
  try {
    const url = new URL(input);
    const match = url.pathname.match(/\/@([a-z0-9._-]+)\/([a-z0-9-]+)/);
    if (match) return { author: match[1]!, permlink: match[2]! };
  } catch {
    // not a valid URL
  }
  return null;
}
