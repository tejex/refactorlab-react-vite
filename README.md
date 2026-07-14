# Fixer

Fixer is a small local desktop app that scans a repository and estimates how expensive, confusing, or risky it will be for AI coding agents to work on it.

Fixer does not call an AI model, upload source code, modify files, generate patches, convert apps, or act as a coding agent.

## V1 Flow

1. Open the desktop app.
2. Choose a local project folder with the native folder picker.
3. Fixer scans locally with Rust.
4. The compact report shows unified token accounting and deterministic repository signals.
5. Copy the final Markdown repository packet or download it as a standalone `.md` file.
6. Rescan or export the separate diagnostic report as JSON.

## Stack

- Tauri v2 desktop shell
- React + TypeScript UI
- Rust scanner/backend commands
- SQLite local report history

## Token accounting

Fixer uses `tiktoken-rs` with the explicit `o200k_base` encoding as its primary
deterministic tokenizer. The same counter measures every AI-eligible repository
file and the exact final Markdown repository packet. If the tokenizer cannot
initialize, both sides use the clearly labeled `characters / 4` fallback; Fixer
never mixes primary and fallback counts in one comparison.

## Run

```bash
npm install
npm run tauri:dev
```

The Tauri npm scripts explicitly add `$HOME/.cargo/bin` to `PATH` so Cargo is found even when the terminal session does not inherit Rust's shell setup.

## Validate

```bash
npm run typecheck
npm run build
cd src-tauri && cargo fmt --check && cargo check && cargo test
npm run tauri:build -- --debug
```

## Structure

```text
src/                 React + TypeScript desktop UI
src/components/      compact empty, progress, report, score, and driver views
src-tauri/           Tauri v2 shell and Rust backend
src-tauri/src/       scanner, report schema, SQLite storage, commands
```
