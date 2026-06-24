import type { ProjectRootDetector } from "../roots";
import { proof } from "../proof";

export const publicResourcesDetector: ProjectRootDetector = {
  id: "public-resources",
  detect(input) {
    const preservedArtifacts = input.allPaths
      .filter((path) => path.startsWith("public/"))
      .map((path) => ({
        id: `artifact:public:${path}`,
        kind: "public-resource" as const,
        label: path,
        path,
        externallyAddressable: true,
        reason: "Public resource can be requested directly and is preserved without becoming a source root.",
        proof: proof("supported", [{ source: "public-resources", detail: "File lives under public/.", path }]),
      }));

    return { roots: [], candidates: [], preservedArtifacts, diagnostics: [] };
  },
};

