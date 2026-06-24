import type { ProjectRootDetector } from "../roots";
import { existingProjectPath, rootProof, runtimeForCommand, scriptDomain } from "./shared";

export const packageCommandsDetector: ProjectRootDetector = {
  id: "package-commands",
  detect(input) {
    const packageJson = input.fileByPath.get("package.json");
    if (!packageJson) return { roots: [], candidates: [], preservedArtifacts: [], diagnostics: [] };

    const scripts = readScripts(packageJson.text);
    const roots = Object.entries(scripts)
      .flatMap(([name, command]) =>
        fileTargets(command)
          .map((target) => existingProjectPath(target, input))
          .filter((path): path is string => Boolean(path))
          .map((path) => ({
            id: `root:package-command:${name}`,
            kind: "package-command" as const,
            label: name,
            path,
            domain: scriptDomain(name),
            runtime: runtimeForCommand(command),
            proof: rootProof("package-commands", `package.json script "${name}" resolves to an executable file target.`, "package.json", "proven"),
          })),
      )
      .sort((a, b) => a.id.localeCompare(b.id));

    return { roots, candidates: [], preservedArtifacts: [], diagnostics: [] };
  },
};

function readScripts(text: string): Record<string, string> {
  try {
    const parsed = JSON.parse(text) as { scripts?: Record<string, unknown> };
    return Object.fromEntries(Object.entries(parsed.scripts ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  } catch {
    return {};
  }
}

function fileTargets(command: string): string[] {
  const matches = [...command.matchAll(/(?:^|\s)(?!-)([A-Za-z0-9_./-]+\.(?:js|jsx|ts|tsx|mjs|cjs|mts|cts))/gi)];
  return [...new Set(matches.map((match) => match[1]))].sort();
}

