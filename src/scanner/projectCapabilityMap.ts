import type { ZipTextFile } from "./browserZip";
import type { ProjectCapability, ProjectCapabilityMap } from "./types";

interface CapabilityInput {
  htmlRoutes: number;
  verifiedRewrites: number;
  cssFiles: number;
  jsFiles: number;
  tsFiles: number;
  behaviorBindings: number;
  routePackets: number;
}

export function buildProjectCapabilityMap(files: ZipTextFile[], input: CapabilityInput): ProjectCapabilityMap {
  const counts = extensionCounts(files);
  const capabilities: ProjectCapability[] = [
    {
      id: "static-web",
      label: "Static HTML route map",
      status: input.htmlRoutes ? "supported" : "missing",
      detected: input.htmlRoutes,
      detail: input.htmlRoutes ? "Route packets and source pages can be generated." : "No HTML routes detected.",
      facts: [`html=${counts.html.toLocaleString()}`, `routes=${input.htmlRoutes.toLocaleString()}`],
    },
    {
      id: "verified-rewrite",
      label: "Verified HTML/CSS/JS rewrite",
      status: input.verifiedRewrites ? "supported" : "partial",
      detected: input.verifiedRewrites,
      detail: input.verifiedRewrites ? "Parser-verified inline extraction is available." : "No guaranteed copy-only rewrite found.",
      facts: [`safeChanges=${input.verifiedRewrites.toLocaleString()}`],
    },
    {
      id: "css-analysis",
      label: "CSS maps",
      status: input.cssFiles ? "supported" : "partial",
      detected: input.cssFiles,
      detail: input.cssFiles ? "Duplicate selectors, reachability, and selector ownership are available." : "Only inline CSS can be analyzed.",
      facts: [`cssFiles=${input.cssFiles.toLocaleString()}`],
    },
    {
      id: "javascript-behavior",
      label: "JavaScript behavior map",
      status: input.jsFiles || input.behaviorBindings ? "partial" : "inventory",
      detected: input.jsFiles,
      detail: "Events and DOM effects can be mapped, but behavior is not automatically rewritten.",
      facts: [`jsFiles=${input.jsFiles.toLocaleString()}`, `behavior=${input.behaviorBindings.toLocaleString()}`],
    },
    {
      id: "typescript-conversion",
      label: "TypeScript conversion",
      status: "missing",
      detected: input.tsFiles,
      detail: "TypeScript is counted and indexed, but there is no dedicated TS adapter or verified TS rewrite engine yet.",
      facts: [`tsFiles=${input.tsFiles.toLocaleString()}`, "adapter=missing"],
    },
    {
      id: "route-starter",
      label: "React/Next route starter",
      status: input.routePackets ? "supported" : "missing",
      detected: input.routePackets,
      detail: input.routePackets ? "One route can be packaged as a starter scaffold." : "Route starter needs at least one route packet.",
      facts: [`routePackets=${input.routePackets.toLocaleString()}`],
    },
  ];

  return {
    primaryLane: "Web to React/Next",
    supported: capabilities.filter((capability) => capability.status === "supported").length,
    partial: capabilities.filter((capability) => capability.status === "partial").length,
    missing: capabilities.filter((capability) => capability.status === "missing").length,
    inventory: capabilities.filter((capability) => capability.status === "inventory").length,
    capabilities,
  };
}

function extensionCounts(files: ZipTextFile[]) {
  return files.reduce(
    (counts, file) => {
      const path = file.path.toLowerCase();
      if (path.endsWith(".html")) counts.html += 1;
      if (path.endsWith(".css")) counts.css += 1;
      if (/\.(js|jsx|mjs|cjs)$/.test(path)) counts.js += 1;
      if (/\.(ts|tsx|mts|cts)$/.test(path)) counts.ts += 1;
      return counts;
    },
    { html: 0, css: 0, js: 0, ts: 0 },
  );
}
