import type { ComponentOwnership, ProjectReport, RouteConversionPacket } from "./types";
import { downloadZip, type ZipFileInput } from "./zipWriter";
import {
  aiInstructionsMarkdown,
  appPagePathForRoute,
  behaviorMarkdown,
  componentTsx,
  cssModule,
  pageTsx,
  readmeMarkdown,
  safeComponentName,
  selectorMap,
} from "./routeStarterPackContent";
import {
  maxStarterComponents,
  routeStarterPackRoot,
  type RouteStarterComponent,
  type RouteStarterLocator,
  type RouteStarterPackBuild,
  type RouteStarterPackManifest,
  type RouteStarterPackStats,
} from "./routeStarterPackTypes";

export type { RouteStarterPackBuild, RouteStarterPackManifest, RouteStarterPackStats } from "./routeStarterPackTypes";

export function buildRouteStarterPack(report: ProjectReport): RouteStarterPackBuild {
  const packet = selectStarterPacket(report);
  if (!packet) throw new Error("route starter pack needs at least one route packet");

  const components = starterComponents(packet);
  const appPagePath = appPagePathForRoute(packet.routePath);
  const baseFiles: ZipFileInput[] = [
    jsonFile("source/route-packet.json", packet),
    jsonFile("source/selector-map.json", selectorMap(packet, components)),
    { path: `${routeStarterPackRoot}/README.md`, content: readmeMarkdown(report, packet) },
    { path: `${routeStarterPackRoot}/source/ai-instructions.md`, content: aiInstructionsMarkdown(packet) },
    { path: `${routeStarterPackRoot}/behavior/${packet.slug}-behavior.md`, content: behaviorMarkdown(packet) },
    { path: `${routeStarterPackRoot}/styles/${packet.slug}.module.css`, content: cssModule() },
    { path: appPagePath, content: pageTsx(packet, components) },
    ...components.map((component) => ({
      path: `${routeStarterPackRoot}/components/${component.name}.tsx`,
      content: componentTsx(packet, component),
    })),
  ];
  const stats = buildStats(packet, components.length, baseFiles.length + 1);
  const manifest = buildManifest(report, packet, stats, appPagePath, [
    `${routeStarterPackRoot}/route-starter-manifest.json`,
    ...baseFiles.map((file) => file.path),
  ]);
  const files = [
    {
      path: `${routeStarterPackRoot}/route-starter-manifest.json`,
      content: `${JSON.stringify(manifest, null, 2)}\n`,
    },
    ...baseFiles,
  ];

  return { files, manifest, stats, packet };
}

export function downloadRouteStarterPack(report: ProjectReport): RouteStarterPackBuild {
  const pack = buildRouteStarterPack(report);
  downloadZip(pack.files, "fixer-route-starter-pack.zip");
  return pack;
}

function selectStarterPacket(report: ProjectReport): RouteConversionPacket | null {
  const packets = report.reactConversionMap?.routePackets ?? [];
  const primarySlug = report.reactConversionMap?.aiHandoff.primaryRoute?.packetSlug;
  return packets.find((packet) => packet.slug === primarySlug) ?? [...packets].sort((a, b) => starterScore(b) - starterScore(a))[0] ?? null;
}

function starterScore(packet: RouteConversionPacket): number {
  return packet.componentOwners.length * 4 + packet.behaviorBindings.length * 3 + packet.cssSelectors.length + packet.assets.length - packet.blockers.length * 20;
}

function buildStats(packet: RouteConversionPacket, components: number, outputFiles: number): RouteStarterPackStats {
  return {
    routePath: packet.routePath,
    sourceFile: packet.sourceFile,
    pageComponentName: packet.pageComponentName,
    components,
    behaviorBindings: packet.behaviorBindings.length,
    cssSelectors: packet.cssSelectors.length,
    assets: packet.assets.length,
    blockers: packet.blockers.length,
    outputFiles,
  };
}

function buildManifest(
  report: ProjectReport,
  packet: RouteConversionPacket,
  stats: RouteStarterPackStats,
  appPagePath: string,
  files: string[],
): RouteStarterPackManifest {
  return {
    source: report.sourceName,
    generatedAt: new Date().toISOString(),
    purpose: "Parser-backed starter scaffold for converting one route into React or Next.js without asking an AI to scan blindly.",
    recommendedUse: [
      "Start with source/route-packet.json.",
      "Use app page and component files as a scaffold, not as a completed migration.",
      "Fill JSX from the sourceFile and locator ranges in the route packet.",
      "Keep behavior/ markdown open while converting event handlers and DOM updates.",
    ],
    route: {
      path: packet.routePath,
      sourceFile: packet.sourceFile,
      packetSlug: packet.slug,
      appPagePath,
    },
    stats,
    files,
  };
}

function starterComponents(packet: RouteConversionPacket): RouteStarterComponent[] {
  const used = new Set<string>();
  return [...packet.componentOwners].sort((a, b) => componentScore(b, packet) - componentScore(a, packet)).slice(0, maxStarterComponents).map((owner, index) => {
    const baseName = safeComponentName(owner.componentName || `RouteSection${index + 1}`);
    let name = baseName;
    let suffix = 2;
    while (used.has(name)) {
      name = `${baseName}${suffix}`;
      suffix += 1;
    }
    used.add(name);
    return {
      name,
      owner,
      locator: routeLocatorForOwner(owner, packet.sourceFile),
      routeSpecific: owner.routesUsedIn.length === 1 && owner.routesUsedIn[0] === packet.routePath,
    };
  });
}

function componentScore(owner: ComponentOwnership, packet: RouteConversionPacket): number {
  const hasRouteLocator = Boolean(routeLocatorForOwner(owner, packet.sourceFile));
  const routeSpecific = owner.routesUsedIn.length === 1 && owner.routesUsedIn[0] === packet.routePath;
  const routeSourceOwned = owner.sourceFiles.includes(packet.sourceFile);
  return (
    (routeSpecific ? 1_000 : 0) +
    (hasRouteLocator ? 240 : 0) +
    (routeSourceOwned ? 140 : 0) +
    owner.behaviorBindings.length * 80 +
    owner.cssSelectors.length * 8 +
    owner.assets.length * 4 -
    Math.max(0, owner.routesUsedIn.length - 1) * 12
  );
}

function routeLocatorForOwner(owner: ComponentOwnership, sourceFile: string): RouteStarterLocator | null {
  return owner.locators.find((locator) => locator.sourceFile === sourceFile) ?? owner.locators[0] ?? null;
}

function jsonFile(path: string, value: unknown): ZipFileInput {
  return {
    path: `${routeStarterPackRoot}/${path}`,
    content: `${JSON.stringify(value, null, 2)}\n`,
  };
}
