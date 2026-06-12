import type { PatternCounter, SourceExtension } from "./types.ts";

export const sourceExtensions = new Set<SourceExtension>([".html", ".js", ".css", ".ts"]);

export const ignoredDirs = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".vite",
  "assets",
  "images",
  "generated",
  "brand-references",
]);

export const sideEffectPatterns: PatternCounter[] = [
  ["network", /\b(fetch|XMLHttpRequest|WebSocket|EventSource)\b/g],
  ["storage", /\b(localStorage|sessionStorage|indexedDB|caches)\b/g],
  ["dom", /\b(querySelector|querySelectorAll|getElementById|classList|innerHTML|appendChild|removeChild)\b/g],
  ["timer", /\b(setTimeout|setInterval|requestAnimationFrame)\b/g],
  ["env", /\b(process\.env|import\.meta\.env)\b/g],
  ["logging", /\b(console\.(log|warn|error|info|debug))\b/g],
  ["navigation", /\b(location|history|URLSearchParams)\b/g],
  ["worker-platform", /\b(Stripe|Supabase|Deno|Response|Request|KV|R2|DurableObject|ExecutionContext)\b/g],
];
