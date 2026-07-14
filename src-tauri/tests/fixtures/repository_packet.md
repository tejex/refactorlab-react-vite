# Repository Context

## Project Overview
- AI-eligible languages: TypeScript
- Repository: sample
- Scanned text files: 7

## Project Shape
- sample — `package.json` (root package)

## AI-Eligible Languages
- Scope: 4 AI-eligible repository files
- TypeScript — 8 files / 100000 tokens

## Technology Stack
### Root package — sample
- Express — direct dependency

## Repository Structure
- Repository root — 3 scanned text files / 260 tokens
- `src/` — 4 scanned text files / 35200 tokens

## Entrypoints and Important Files
- `package.json` — package manifest; 50 tokens; JSON
- `src/core.ts` — highest repository-local static fan-in: imported by 7 files; highest repository-local static fan-out: imports 5 local files; largest AI-eligible source file; 32500 tokens; TypeScript
- `src/main.tsx` — confirmed frontend entrypoint; referenced by `index.html`; one of the 3 largest AI-eligible source files; 1200 tokens; React TSX
- `src/render.ts` — one of the 3 largest AI-eligible source files; 1000 tokens; TypeScript

## Development and Verification Commands
### Root package — sample
- Development: not detected
- Build: `npm run build`
- Tests: not detected
- Lint: not detected
- Dedicated typecheck: `npm run typecheck`

## Import Analysis
- AI-eligible JavaScript/TypeScript files parsed for imports: 4
- Circular repository-local static dependency files: 1
- Dynamic imports: 0 (reported separately; excluded from fan-in, fan-out, and cycles)
- External package static references: 6
- JavaScript/TypeScript unresolved repository-local static references: 2 across 4 parsed files
- Machine-specific absolute static references: 0
- Maximum repository-local static fan-in: 7
- Maximum repository-local static fan-out: 5
- Other or unclassified static references: 0
- Resolved repository-local static references: 12
- Static module references: 20
- `src/core.ts` — local static fan-in 7 / fan-out 5; 32500 tokens; TypeScript

## Unresolved Imports
- `src/a.ts` → `../missing-a`
- `src/z.ts` → `./missing-z`

## Analysis Coverage
- Entrypoint analysis: partial by bounded rules for supported package scripts and HTML module references; 2 evidence files examined
- File and token classification: complete for 7 readable text files
- Import syntax coverage: partial; static imports, re-exports, require calls, and dynamic imports are supported
- JavaScript/TypeScript import file coverage: complete for the AI-eligible supported-file scope; 6 candidate files examined, 4 AI-eligible supported files parsed, 2 candidate files skipped because their context roles are outside the import-graph scope
- Other detected languages not analyzed for imports: CSS, HTML
- Package-command analysis: complete for 1 package.json manifest under bounded npm-family script rules

## Privacy and Runtime Signals
### Authored source
- `src/auth.ts` — potential secret-like string: 2
- `src/render.ts` — innerHTML: 3

## Context Accounting
- Excluded — Runtime data: 10 tokens / 1 files
- Included — AI-eligible repository context: 34750 tokens / 4 files
- Included — Authored source: 34700 tokens / 3 files
- Included — Source-of-truth configuration: 50 tokens / 1 files
- Summarized — Dependency lockfiles: 200 tokens / 1 files
- Summarized — Generated/reference output: 500 tokens / 1 files
- Total readable repository context: 35460 tokens

## Deterministic Repository Warnings
- CI configuration missing
- Circular import files: 1
- JavaScript/TypeScript unresolved repository-local static references: 2
- Potential secret-like signals: 2
- Runtime ambiguity-pattern matches: 3
- Test script missing

## Methodology
- Context classifier: context-classifier-v2
- Deterministic scanner facts only; no AI model generated this packet
- Fan-in, fan-out, and cycle analysis use resolved repository-local static references only; dynamic imports are separate
- Import arithmetic: static references = resolved local + external package + unresolved local + machine-specific absolute + other/unclassified
- Repository-relative paths only; secret values, private URL values, and source snippets are omitted
- Secret-like and private-URL findings are deterministic pattern matches and were not externally validated
- Tokenizer fallback used for both repository and packet totals
- Tokenizer: fallback / characters_divided_by_four
