# Fixer

Fixer is a small local desktop app that scans a repository and estimates how expensive, confusing, or risky it will be for AI coding agents to work on it.

Fixer does not call an AI model, upload source code, modify files, generate patches, convert apps, or act as a coding agent.

## V1 Flow

1. Open the desktop app.
2. Choose a local project folder with the native folder picker.
3. Fixer scans locally with Rust.
4. The compact report shows AI coding cost scores and the top cost drivers.
5. Rescan or export the report as JSON.

## Stack

- Tauri v2 desktop shell
- React + TypeScript UI
- Rust scanner/backend commands
- SQLite local report history

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
