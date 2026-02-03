# Agent Guide for hive-tx-cli

This repo is a TypeScript/Node ESM CLI for the Hive blockchain using hive-tx.
Use this guide when making changes or adding commands.

## Requirements

- Node.js >= 22 (see `package.json`).
- Package manager: `pnpm` (see `packageManager`).
- TypeScript build via `tsc` (see `tsconfig.json`).
- `bun` only needed for `build:binary` (optional).

## Key paths

- CLI entry: `src/index.ts` (commander program setup).
- Commands: `src/commands/`.
- Hive client wrapper: `src/hive-client.ts`.
- Config handling: `src/config.ts`.
- Shared types: `src/types.ts`.
- Runtime entrypoint: `bin/hive.js` -> `dist/index.js`.

## Build / Run / Lint / Test

- Install: `pnpm install`.
- Build (tsc): `pnpm build`.
- Dev (tsx): `pnpm dev` (runs `src/index.ts`).
- Run built CLI: `pnpm start` (runs `dist/index.js`).
- Build native binary: `pnpm build:binary` (requires `bun`).
- Prepare hook: `pnpm prepare` (runs `pnpm build`).

## Tests

- Test runner: not configured (no `test` script).
- Single test: N/A (no test framework wired).
- If adding tests, update `package.json` with a `test` script and document single-test usage here.

## Lint / Format

- Linting: not configured (no ESLint/biome).
- Formatting: not configured (no Prettier). Follow existing style.

## Language and module system

- TypeScript with strict settings (`strict`, `noImplicitAny`, `noUncheckedIndexedAccess`).
- ESM (`"type": "module"`, NodeNext module resolution).
- Always use `.js` file extensions in relative TS imports (NodeNext requirement).
- Prefer `import type { ... }` for types.

## Code style guidelines

- Indentation: 2 spaces; keep consistent with existing files.
- Quotes: single quotes for strings.
- Semicolons are used; keep them.
- Trailing commas are common; keep them in multi-line literals.
- Prefer `const` and `let`; avoid `var`.
- Prefer `async/await` over raw promise chains.
- Keep functions small and command actions focused on one operation.

## Imports and module boundaries

- Group imports by source: node built-ins, third-party, local.
- Use `import type` for types (see `src/config.ts`).
- Avoid cross-linking commands; route shared logic through `src/utils.ts` or `src/hive-client.ts`.

## Naming conventions

- Files: kebab-case or simple names (`hive-client.ts`, `config.ts`).
- Variables: camelCase; constants in UPPER_SNAKE for global constants.
- Classes: PascalCase (see `HiveClient`).
- Commands: use descriptive names (`vote`, `comment`, `custom-json`).

## Error handling and UX

- For CLI failures, print a user-friendly message and `process.exit(1)`.
- For interactive flows, use `inquirer` prompts.
- For async operations, use `ora` spinners and stop/fail them appropriately.
- Prefer `chalk` for colored status messages.
- Avoid leaking private keys in logs or errors.

## Types and data validation

- Keep config types in `src/types.ts` (`Config`, `HiveOperation`).
- Favor `unknown` over `any` and narrow when possible.
- Existing code uses `error: any` to read `error.message`; keep consistent unless refactoring.
- Validate user input via `commander` options/arguments and `inquirer` validation.

## CLI command patterns

- Commands are built with `commander` and exported as arrays.
- Command handlers usually:
  - Load config (`getConfig()`), fail if missing.
  - Build operation payloads.
  - Use `HiveClient` for API calls or broadcasts.
  - Output JSON responses with `JSON.stringify(result, null, 2)`.
- Add new commands in `src/commands/` and register them in `src/index.ts`.

## Configuration handling

- Config file: `~/.hive-cli/config.json` with mode 600.
- Use `getConfig`, `saveConfig`, `clearConfig` from `src/config.ts`.
- Do not commit or print private keys; highlight security if touching config.

## API and blockchain specifics

- Default node: `https://api.hive.blog`.
- Default chain id lives in `src/hive-client.ts`.
- Broadcasting uses `hive-tx` `Transaction` with signing keys.

## Output conventions

- Machine-readable outputs for API results (pretty JSON).
- Human-friendly status messages with icons (e.g., ✔, ✗, ⚠).
- Keep output stable; users may script around it.

## Practical guidance for agents

- Prefer minimal, surgical changes.
- Avoid adding new dependencies unless necessary.
- If you add a new script (lint/test/etc), update this file.
- Keep the CLI UX consistent with existing commands and messaging style.

## Quick command reference

- Dev run: `pnpm dev -- <command> [args]` (example: `pnpm dev -- account alice`).
- Build: `pnpm build`.
- Start built: `pnpm start`.
- Binary build: `pnpm build:binary`.
