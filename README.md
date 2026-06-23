# fixer.ai

Browser-based static analyzer for messy HTML/CSS/JS/TS project archives.

## Run

```bash
npm install
npm run dev
```

Supabase auth is optional for local development. To enable it, copy `.env.example` to `.env` and fill in:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

## Current V1

- Upload a `.zip` project archive.
- Ignore dependency and build folders.
- Parse HTML with `DOMParser`.
- Scan CSS/JS/TS text for selectors, symbols, side effects, size, and structure.
- Show parser facts, ranked files, clusters, extraction candidates, and copy-only guaranteed-safe changes.

## Scripts

```bash
npm run lint
npm run build
npm run analyze:static -- path/to/project-or-zip
```
