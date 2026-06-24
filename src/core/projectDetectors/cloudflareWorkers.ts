import type { ProjectRootDetector } from "../roots";
import { existingProjectPath, rootProof, unresolvedProof } from "./shared";

export const cloudflareWorkersDetector: ProjectRootDetector = {
  id: "cloudflare-workers",
  detect(input) {
    const configRoots = explicitConfigRoots(input);
    const conventionRoots = configRoots.length ? [] : conventionRootsFromPaths(input);
    const candidates = configRoots.length || conventionRoots.length ? [] : unresolvedCandidates(input);

    return {
      roots: [...configRoots, ...conventionRoots],
      candidates,
      preservedArtifacts: [],
      diagnostics: [],
    };
  },
};

function explicitConfigRoots(input: Parameters<ProjectRootDetector["detect"]>[0]) {
  return ["wrangler.json", "wrangler.jsonc"]
    .flatMap((configPath) => {
      const config = input.fileByPath.get(configPath);
      if (!config) return [];
      const main = extractJsonString(config.text, "main");
      if (!main) return [];
      const entry = existingProjectPath(main, input);
      if (!entry) return [];

      return [
        {
          id: `root:cloudflare-worker:${entry}`,
          kind: "cloudflare-worker" as const,
          label: entry,
          path: entry,
          domain: "production" as const,
          runtime: "cloudflare-worker" as const,
          proof: rootProof("cloudflare-workers", `Explicit Wrangler main from ${configPath}.`, configPath, "proven"),
        },
      ];
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

function conventionRootsFromPaths(input: Parameters<ProjectRootDetector["detect"]>[0]) {
  const hasWorkerSignal =
    input.allPathSet.has("wrangler.toml") ||
    input.allPathSet.has("wrangler.json") ||
    input.allPathSet.has("wrangler.jsonc") ||
    Boolean(input.fileByPath.get("package.json")?.text.match(/\bwrangler\b/));
  if (!hasWorkerSignal) return [];

  return ["src/worker", "worker", "src/index", "functions/_worker", "public/_worker"]
    .map((candidate) => existingProjectPath(candidate, input))
    .filter((path): path is string => Boolean(path))
    .map((entry) => ({
      id: `root:cloudflare-worker:${entry}`,
      kind: "cloudflare-worker" as const,
      label: entry,
      path: entry,
      domain: "production" as const,
      runtime: "cloudflare-worker" as const,
      proof: rootProof("cloudflare-workers", "Worker convention plus Wrangler project signal.", entry, "heuristic"),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function unresolvedCandidates(input: Parameters<ProjectRootDetector["detect"]>[0]) {
  if (!input.allPathSet.has("wrangler.toml")) return [];
  return [
    {
      id: "candidate:cloudflare-worker:wrangler-toml",
      kind: "cloudflare-worker" as const,
      label: "Wrangler config",
      path: "wrangler.toml",
      domain: "production" as const,
      runtime: "cloudflare-worker" as const,
      reason: "Wrangler TOML config is present, but no worker entry could be resolved from decoded source files.",
      proof: unresolvedProof("cloudflare-workers", "Wrangler TOML needs config parsing or a conventional worker entry.", "wrangler.toml"),
    },
  ];
}

function extractJsonString(text: string, key: string): string | null {
  const withoutComments = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const match = withoutComments.match(new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`));
  return match?.[1] ?? null;
}

