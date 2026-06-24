import type { ProjectRootDetector } from "../roots";
import { rootProof } from "./shared";

export const typescriptProjectsDetector: ProjectRootDetector = {
  id: "typescript-projects",
  detect(input) {
    const roots = input.allPaths
      .filter((path) => /(^|\/)tsconfig(?:\.[^/]+)?\.json$/i.test(path))
      .map((path) => ({
        id: `root:typescript-project:${path}`,
        kind: "typescript-project" as const,
        label: path,
        path,
        domain: "build" as const,
        runtime: "node" as const,
        proof: rootProof("typescript-projects", "TypeScript project boundary config.", path, "supported"),
      }));

    return { roots, candidates: [], preservedArtifacts: [], diagnostics: [] };
  },
};

