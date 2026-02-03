import { homedir } from 'os';
import { join } from 'path';
import fs from 'fs-extra';
import type { Config } from './types.js';

const CONFIG_DIR = join(homedir(), '.hive-cli');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

function getEnvConfig(): Partial<Config> {
  const envConfig: Partial<Config> = {};

  if (process.env.HIVE_ACCOUNT) {
    envConfig.account = process.env.HIVE_ACCOUNT;
  }

  if (process.env.HIVE_POSTING_KEY) {
    envConfig.postingKey = process.env.HIVE_POSTING_KEY;
  }

  if (process.env.HIVE_ACTIVE_KEY) {
    envConfig.activeKey = process.env.HIVE_ACTIVE_KEY;
  }

  return envConfig;
}

export async function getConfig(): Promise<Config | null> {
  const envConfig = getEnvConfig();
  let fileConfig: Config | null = null;

  try {
    if (!(await fs.pathExists(CONFIG_FILE))) {
      if (!envConfig.account) {
        return null;
      }
      return {
        account: envConfig.account || '',
        postingKey: envConfig.postingKey,
        activeKey: envConfig.activeKey,
      };
    }
    const config = await fs.readJson(CONFIG_FILE);
    fileConfig = config as Config;
  } catch {
    if (!envConfig.account) {
      return null;
    }
    return {
      account: envConfig.account || '',
      postingKey: envConfig.postingKey,
      activeKey: envConfig.activeKey,
    };
  }

  const mergedConfig = {
    ...(fileConfig || {}),
    ...envConfig,
  };

  return {
    ...mergedConfig,
    account: mergedConfig.account || '',
  } as Config;
}

export async function saveConfig(config: Config): Promise<void> {
  await fs.ensureDir(CONFIG_DIR);
  await fs.writeJson(CONFIG_FILE, config, { spaces: 2, mode: 0o600 });
}

export async function clearConfig(): Promise<void> {
  if (await fs.pathExists(CONFIG_FILE)) {
    await fs.remove(CONFIG_FILE);
  }
}

export async function hasConfig(): Promise<boolean> {
  const envConfig = getEnvConfig();
  return Boolean(envConfig.account) || fs.pathExists(CONFIG_FILE);
}
