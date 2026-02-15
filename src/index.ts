#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { getConfig } from './config.js';
import { configCommand } from './commands/config.js';
import { queryCommands } from './commands/query.js';
import { publishCommands } from './commands/publish.js';
import { socialCommands } from './commands/social.js';
import { communityCommands } from './commands/community.js';
import { accountCommands } from './commands/account.js';
import { broadcastCommands } from './commands/broadcast.js';
import { uploadImageCommands } from './commands/upload-image.js';
import { packageJson } from './utils.js';

const program = new Command();

program
  .name('hive')
  .description('CLI wrapper for the Hive blockchain API')
  .version(packageJson.version)
  .option('-n, --node <url>', 'Hive node URL')
  .option('-a, --account <name>', 'Hive account name')
  .hook('preAction', async (command) => {
    const opts = command.opts();
    const config = await getConfig();
    
    if (opts.node) {
      process.env.HIVE_NODE = opts.node;
    }
    if (opts.account) {
      process.env.HIVE_ACCOUNT = opts.account;
    }
  });

program.addCommand(configCommand);

for (const cmd of queryCommands) {
  program.addCommand(cmd);
}

for (const cmd of publishCommands) {
  program.addCommand(cmd);
}

for (const cmd of socialCommands) {
  program.addCommand(cmd);
}

for (const cmd of communityCommands) {
  program.addCommand(cmd);
}

for (const cmd of accountCommands) {
  program.addCommand(cmd);
}

for (const cmd of broadcastCommands) {
  program.addCommand(cmd);
}

for (const cmd of uploadImageCommands) {
  program.addCommand(cmd);
}

program
  .command('status')
  .description('Show configuration status')
  .action(async () => {
    const config = await getConfig();
    if (!config) {
      console.log(chalk.yellow('⚠ No configuration found'));
      console.log(chalk.dim('Run "hive config" to set up your account'));
      process.exit(1);
    }
    
    console.log(chalk.green('✔ Configuration found'));
    console.log(`  Account: ${chalk.bold(config.account || 'Not set')}`);
    console.log(`  Node: ${config.node || 'Default (api.hive.blog)'}`);
    console.log(`  Posting Key: ${config.postingKey ? chalk.green('✔ Set') : chalk.red('✗ Not set')}`);
    console.log(`  Active Key: ${config.activeKey ? chalk.green('✔ Set') : chalk.yellow('○ Not set')}`);
  });

program.parse();
