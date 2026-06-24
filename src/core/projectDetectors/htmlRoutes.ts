import type { ProjectRootDetector } from "../roots";
import { routeId, routePathForHtml, rootProof } from "./shared";

export const htmlRoutesDetector: ProjectRootDetector = {
  id: "html-routes",
  detect(input) {
    const roots = input.files
      .filter((file) => file.path.toLowerCase().endsWith(".html"))
      .map((file) => {
        const routePath = routePathForHtml(file.path);
        return {
          id: `root:html-route:${routeId(routePath)}`,
          kind: "html-route" as const,
          label: routePath,
          path: file.path,
          domain: "production" as const,
          runtime: "browser" as const,
          proof: rootProof("html-routes", "HTML file is browser-addressable route input.", file.path),
        };
      });

    return { roots, candidates: [], preservedArtifacts: [], diagnostics: [] };
  },
};

