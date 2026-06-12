# fixer.ai

React + Vite app for scanning messy web projects and finding the safest first refactor path before code is rewritten.

## Run locally

```bash
npm install
npm run dev
```

## Current product surface

- Paste a GitHub repository URL.
- Upload a compressed project export.
- Classify the repo shape from early signals.
- Preview structural risks and a staged repair roadmap.

## First scanner targets

- Lovable-style React/Vite/Supabase apps.
- Static HTML/CSS/JS products with API backends, like Tokensmith.
- Mixed AI-generated web repos that need stack classification before refactoring.

The scanner logic starts in `src/scanner/analyzeProject.ts`. The app UI is split into React components under `src/components/`.

## TokenSmith fixture

TokenSmith is the first plain HTML/JS sample for the V1 analyzer. Keep the fixture local under `fixtures/tokensmith-main`; the fixture is intentionally ignored by git because it is large.

```bash
npm run analyze:tokensmith
```

That command runs `scripts/analyze-static-html.ts`, scans `fixtures/tokensmith-main`, and writes `reports/tokensmith-static-analysis.json`. The current pass measures file size, symbols, imports, selectors, event handlers, browser/platform side effects, complexity estimates, duplicated selectors, repeated symbol names, and surface-level clusters.
