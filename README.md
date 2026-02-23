# Hive CLI

A command-line interface for the Hive blockchain API built on [hive-tx](https://github.com/mahdiyari/hive-tx) v6.

## Features

- Query account data, balances, blocks, feed posts, replies, RC, and raw API methods.
- Broadcast common operations: publish, reply, edit, vote, transfer, custom JSON, and raw operations.
- Social/community actions: follow, unfollow, mute, unmute, reblog, and community subscribe flows.
- Rewards and profile tools: claim rewards, delegate HP, and update profile metadata.
- URL-aware commands for content lookup and vote/delete/reply flows.
- Optional confirmation wait mode for supported broadcasts.
- Secure config in `~/.hive-tx-cli/config.json` (mode `600`) plus env var overrides.

## Installation

```bash
pnpm install -g @peakd/hive-tx-cli
# or
yarn global add @peakd/hive-tx-cli
# or
npm install -g @peakd/hive-tx-cli
```

## Quick Start

```bash
# Interactive configuration
hive config

# Verify config
hive status

# Basic query
hive account peakd

# Vote by URL
hive vote --url https://peakd.com/@author/permlink --weight 100
```

## Commands

### Configuration

```bash
hive config
hive config --show
hive config set account myaccount
hive config get account
hive config --clear
```

### Query Commands

```bash
# Account and balances
hive account <username>
hive balance <username>
hive rc <username>

# Chain state
hive props
hive block <number>

# Content lookup (author/permlink or URL)
hive content <author> <permlink>
hive content https://peakd.com/@author/permlink
hive replies <author> <permlink>
hive replies https://peakd.com/@author/permlink
hive feed <account> --limit 10

# Raw API call
hive call database_api get_accounts '[["username"]]'
hive call condenser_api get_content_replies '["author","permlink"]' --raw
```

### Broadcast Commands

```bash
# Publish (aliases: post, comment)
hive publish --permlink my-post --title "My Post" --body "Content" --tags "hive,cli"
hive publish --permlink my-post --title "My Post" --body-file ./post.md --metadata '{"app":"hive-tx-cli"}'
hive publish --permlink my-reply --title "Re" --body "Reply body" --parent-url https://peakd.com/@author/permlink

# Reply/edit/delete
hive reply <parent-author> <parent-permlink> --body "Nice post" --wait
hive edit <author> <permlink> --body-file ./updated.md --tags "hive,update"
hive delete-comment --url https://peakd.com/@author/permlink --wait

# Voting and transfers
hive vote --author <author> --permlink <permlink> --weight 100 --wait
hive vote --url https://peakd.com/@author/permlink --weight 50
hive transfer --to <recipient> --amount "1.000 HIVE" --memo "Thanks" --wait

# Social actions
hive follow <account>
hive unfollow <account>
hive mute <account>
hive unmute <account>
hive reblog --author <author> --permlink <permlink>

# Community tools
hive community search peakd
hive community info hive-12345
hive community subscribers hive-12345
hive community subscribe hive-12345
hive community unsubscribe hive-12345

# Rewards / profile
hive claim
hive delegate <account> "100 HP"
hive profile update --name "My Name" --about "Hive user"

# Custom JSON and raw broadcast
hive custom-json --id <app-id> --json '{"key":"value"}'
hive custom-json --id <app-id> --json '{"key":"value"}' --required-active myaccount --wait
hive broadcast '[{"type":"vote","value":{"voter":"me","author":"you","permlink":"post","weight":10000}}]' --key-type posting --wait
```

### Image Upload

```bash
hive upload --file ./path/to/image.jpg
hive upload --file ./path/to/image.jpg --account myaccount
hive upload --file ./path/to/image.jpg --host https://images.ecency.com
```

Returns JSON with the uploaded image URL.

## Global Options

```bash
# Per-command account override
hive --account myaccount vote --author author --permlink permlink --weight 100

# Per-command node override
hive --node https://api.hive.blog account peakd
```

## Environment Variables

Values from env vars override config file values when set.

- `HIVE_ACCOUNT`
- `HIVE_POSTING_KEY`
- `HIVE_ACTIVE_KEY`
- `HIVE_JSON_OUTPUT=1` (disables spinner UI and keeps output machine-friendly)

```bash
export HIVE_ACCOUNT="your-username"
export HIVE_POSTING_KEY="your-posting-private-key"
export HIVE_ACTIVE_KEY="your-active-private-key"

hive vote --author author --permlink permlink --weight 100
```

## Configuration File

Stored at `~/.hive-tx-cli/config.json`:

```json
{
  "account": "your-username",
  "postingKey": "your-posting-private-key",
  "activeKey": "your-active-private-key",
  "node": "https://api.hive.blog"
}
```

Never commit private keys to version control.

## Development

```bash
pnpm install
pnpm build
pnpm dev -- account peakd
pnpm start
```

## Dependencies

- [hive-tx](https://github.com/mahdiyari/hive-tx) v6 - Hive blockchain transaction library
- [commander](https://github.com/tj/commander.js) - CLI framework
- [chalk](https://github.com/chalk/chalk) - Terminal styling
- [inquirer](https://github.com/SBoudrias/Inquirer.js) - Interactive prompts
- [ora](https://github.com/sindresorhus/ora) - Loading spinners
- [fs-extra](https://github.com/jprichardson/node-fs-extra) - Enhanced file system operations

## Requirements

- Node.js >= 22
- pnpm (package manager)

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and questions related to hive-tx, visit: https://github.com/mahdiyari/hive-tx
