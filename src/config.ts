import { homedir } from 'os';
import { join } from 'path';
import fs from 'fs-extra';
import type { Config } from './types.js';

const CONFIG_DIR = join(homedir(), '.hive-cli');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export async function getConfig(): Promise<Config | null> {
  try {
    if (!(await fs.pathExists(CONFIG_FILE))) {
      return null;
    }
    const config = await fs.readJson(CONFIG_FILE);
    return config as Config;
  } catch {
    return null;
  }
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
  return fs.pathExists(CONFIG_FILE);
}
