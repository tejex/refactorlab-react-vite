# Fixer

Fixer is a local desktop AI coding cost estimator for repositories.

V1 scans a local repo, computes deterministic cost/readiness scores, stores report history locally in SQLite, and shows the result in a Tauri desktop app.

Fixer does not call an AI model, upload source code, rewrite files, create patches, or convert apps.

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
cd src-tauri && cargo check
```

## Structure

```text
src/                 React + TypeScript desktop UI
src-tauri/           Tauri v2 shell and Rust backend
src-tauri/src/       scanner, report schema, SQLite storage, commands
```
