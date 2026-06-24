import { dirname, joinProjectPath, normalizeProjectPath } from "../entity";
import { proof } from "../proof";
import type { ProjectRootDetectorInput, ReachabilityDomain, Runtime } from "../roots";

export function routePathForHtml(filePath: string): string {
  const normalized = normalizeProjectPath(filePath).replace(/\.html$/i, "");
  if (normalized === "index") return "/";
  if (normalized.endsWith("/index")) return `/${normalized.slice(0, -"/index".length)}`;
  return `/${normalized}`;
}

export function routeId(routePath: string): string {
  return routePath === "/" ? "/" : routePath.replace(/^\/+/, "");
}

export function resolveExistingPath(fromPath: string, rawPath: string, input: ProjectRootDetectorInput): string | null {
  const cleanPath = normalizeProjectPath(rawPath.split(/[?#]/)[0] ?? "");
  if (!cleanPath) return null;
  const basePath = rawPath.startsWith("/") ? cleanPath : joinProjectPath(dirname(fromPath), cleanPath);
  return pathCandidates(basePath).find((candidate) => input.allPathSet.has(candidate)) ?? null;
}

export function existingProjectPath(rawPath: string, input: ProjectRootDetectorInput): string | null {
  const normalized = normalizeProjectPath(rawPath);
  return pathCandidates(normalized).find((candidate) => input.allPathSet.has(candidate)) ?? null;
}

export function pathCandidates(path: string): string[] {
  const normalized = normalizeProjectPath(path);
  const candidates = [normalized];
  if (!/\.[a-z0-9]+$/i.test(normalized)) {
    candidates.push(`${normalized}.js`, `${normalized}.jsx`, `${normalized}.ts`, `${normalized}.tsx`, `${normalized}.mjs`, `${normalized}.cjs`);
  }
  return [...new Set(candidates)];
}

export function rootProof(source: string, detail: string, path: string, level: "proven" | "supported" | "heuristic" = "supported") {
  return proof(level, [{ source, detail, path }]);
}

export function unresolvedProof(source: string, detail: string, path?: string) {
  return proof("unresolved", [{ source, detail, path }], ["Root candidate needs a resolvable entry file before strong reachability claims."]);
}

export function scriptDomain(scriptName: string): ReachabilityDomain {
  if (/\b(test|spec|vitest|jest|playwright|cypress)\b/i.test(scriptName)) return "test";
  if (/\b(build|compile|typecheck|lint)\b/i.test(scriptName)) return "build";
  if (/\b(migrate|migration|seed)\b/i.test(scriptName)) return "migration";
  return "tooling";
}

export function runtimeForCommand(command: string): Runtime {
  if (/\b(wrangler|miniflare)\b/i.test(command)) return "cloudflare-worker";
  if (/\b(deno|supabase)\b/i.test(command)) return "deno";
  if (/\b(sh|bash|zsh)\b/i.test(command)) return "shell";
  return "node";
}

