import type { ProjectRootDetector } from "../roots";
import { rootProof } from "./shared";

export const testsDetector: ProjectRootDetector = {
  id: "tests",
  detect(input) {
    const roots = input.allPaths
      .filter((path) => /(^|\/)(__tests__\/.*|[^/]+\.(test|spec)\.(js|jsx|ts|tsx|mjs|cjs|mts|cts))$/i.test(path))
      .map((path) => ({
        id: `root:test:${path}`,
        kind: "test-file" as const,
        label: path,
        path,
        domain: "test" as const,
        runtime: "node" as const,
        proof: rootProof("tests", "Test file convention.", path, "supported"),
      }));

    return { roots, candidates: [], preservedArtifacts: [], diagnostics: [] };
  },
};

