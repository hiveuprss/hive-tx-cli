# Hive CLI

A command-line interface wrapper for the Hive blockchain API using [hive-tx](https://github.com/mahdiyari/hive-tx) v6.

## Features

- **Query Operations**: Get account info, blocks, posts, and make raw API calls
- **Broadcast Operations**: Vote, comment, transfer, and broadcast custom JSON
- **Secure Configuration**: Store account credentials safely in `~/.hive-cli/config.json` (permissions 600)
- **Interactive Setup**: Easy configuration with prompts
- **Node.js 22**: Built for modern Node.js with TypeScript

## Installation

```bash

pnpm install -g @peakd/hive-tx-cli

yarn global add @peakd/hive-tx-cli

npm install -g @peakd/hive-tx-cli

```

## Devlopment

```bash
# Clone or download the project
git clone <repository-url>
cd hive-tx-cli

# Install dependencies
pnpm install

# Build the project
pnpm build

# Link globally (optional)
pnpm link --global
```

## Quick Start

1. **Configure your account:**

   ```bash
   hive config
   ```

2. **Check configuration status:**

   ```bash
   hive status
   ```

3. **Query an account:**
   ```bash
   hive account peakd
   ```

## Commands

### Configuration

```bash
# Interactive configuration setup
hive config

# Show current configuration
hive config --show

# Set a specific value
hive config set account myaccount
hive config set postingKey <your-posting-key>

# Get a specific value
hive config get account

# Clear all configuration
hive config --clear
```

### Query Commands

```bash
# Get account information
hive account <username>

# Get dynamic global properties
hive props

# Get block by number
hive block <number>

# Get content (post/comment)
hive content <author> <permlink>

# Make a raw API call
hive call database_api get_accounts '[["username"]]'
```

### Broadcast Commands

```bash
# Vote on a post/comment
hive vote --author <author> --permlink <permlink> --weight 100

# Create a post
hive comment --permlink my-post --title "My Post" --body "Content here" --tags "hive,blockchain"

# Create a comment
hive comment --permlink my-reply --body "Comment text" --parent-author <author> --parent-permlink <permlink>

# Transfer HIVE or HBD (requires active key)
hive transfer --to <recipient> --amount "1.000 HIVE" --memo "Thanks!"

# Broadcast custom JSON
hive custom-json --id <app-id> --json '{"key":"value"}'

# Broadcast raw operations
hive broadcast '["vote",{"voter":"me","author":"you","permlink":"post","weight":10000}]' --key-type posting
```

## Global Options

```bash
# Specify a different Hive node
hive --node https://api.hive.blog account peakd

# Specify account for this command only
hive --account myaccount vote --author author --permlink permlink --weight 100
```

## Configuration File

Configuration is stored in `~/.hive-cli/config.json` with 600 permissions (read/write only for owner):

```json
{
  "account": "your-username",
  "postingKey": "your-posting-private-key",
  "activeKey": "your-active-private-key",
  "node": "https://api.hive.blog"
}
```

**Security Note**: Never commit your private keys to version control!

## Development

```bash
# Run in development mode
pnpm dev

# Build for production
pnpm build

# Run specific command in dev mode
pnpm dev -- account peakd
```

## Dependencies

- [hive-tx](https://github.com/mahdiyari/hive-tx) v6 - Hive blockchain transaction library
- [commander](https://github.com/tj/commander.js) - CLI framework
- [chalk](https://github.com/chalk/chalk) - Terminal styling
- [inquirer](https://github.com/SBoudrias/Inquirer.js) - Interactive prompts
- [ora](https://github.com/sindresorhus/ora) - Loading spinners
- [fs-extra](https://github.com/jprichardson/node-fs-extra) - Enhanced file system operations

## Requirements

- Node.js >= 22.0.0
- pnpm (package manager)

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and questions related to hive-tx, visit: https://github.com/mahdiyari/hive-tx
