import type { ProjectRootDetector } from "../roots";
import { proof } from "../proof";

export const migrationsDetector: ProjectRootDetector = {
  id: "migrations",
  detect(input) {
    const preservedArtifacts = input.allPaths
      .filter((path) => /(^|\/)(supabase|prisma|db|database)\/migrations\/.+/i.test(path))
      .map((path) => ({
        id: `artifact:migration:${path}`,
        kind: "migration" as const,
        label: path,
        path,
        externallyAddressable: false,
        reason: "Migration artifact is preserved for database history, but it does not make app source reachable.",
        proof: proof("supported", [{ source: "migrations", detail: "Migration directory convention.", path }]),
      }));

    return { roots: [], candidates: [], preservedArtifacts, diagnostics: [] };
  },
};

