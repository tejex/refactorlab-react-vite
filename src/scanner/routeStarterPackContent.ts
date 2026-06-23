import { toPascalCase } from "./reactRouteFacts";
import type { ProjectReport, RouteConversionPacket } from "./types";
import { maxStarterBehaviorBindings, maxStarterSelectors, routeStarterPackRoot, type RouteStarterComponent } from "./routeStarterPackTypes";

export function pageTsx(packet: RouteConversionPacket, components: RouteStarterComponent[]): string {
  const rootPrefix = rootImportPrefix(packet.routePath);
  const imports = components.map((component) => `import { ${component.name} } from "${rootPrefix}/components/${component.name}";`).join("\n");
  const componentNodes = components.length
    ? components.map((component) => `      <${component.name} />`).join("\n")
    : `      <section data-fixer-source-file={${tsxString(packet.sourceFile)}} />`;

  return `${imports}${imports ? "\n" : ""}import styles from "${rootPrefix}/styles/${packet.slug}.module.css";

export default function ${safeComponentName(packet.pageComponentName)}() {
  return (
    <main className={styles.route} data-fixer-route={${tsxString(packet.routePath)}} data-fixer-source={${tsxString(packet.sourceFile)}}>
${componentNodes}
    </main>
  );
}
`;
}

export function componentTsx(packet: RouteConversionPacket, component: RouteStarterComponent): string {
  const sourceRange = sourceRangeForComponent(component);
  const children = component.locator?.childSummary.length ? component.locator.childSummary.join(", ") : "none detected";
  const preview = commentText(component.locator?.tinyPreview ?? "no preview available");
  const behaviorCount = component.owner.behaviorBindings.length;

  return `import styles from "../styles/${packet.slug}.module.css";

/*
 * Parser facts
 * Source: ${sourceRange}
 * Selector: ${commentText(component.owner.selector)}
 * Children: ${commentText(children)}
 * Behavior: ${behaviorCount.toLocaleString()} binding(s)
 * Preview: ${preview}
 */
export function ${component.name}() {
  return (
    <section
      className={styles.component}
      data-fixer-component={${tsxString(component.name)}}
      data-fixer-selector={${tsxString(component.owner.selector)}}
      data-fixer-source={${tsxString(sourceRange)}}
    />
  );
}
`;
}

export function cssModule(): string {
  return `.route {
  display: block;
}

.component {
  display: block;
}
`;
}

export function selectorMap(packet: RouteConversionPacket, components: RouteStarterComponent[]) {
  return {
    routePath: packet.routePath,
    sourceFile: packet.sourceFile,
    selectors: unique(packet.cssSelectors).slice(0, maxStarterSelectors),
    components: components.map((component) => ({
      componentName: component.name,
      selector: component.owner.selector,
      sourceRange: sourceRangeForComponent(component),
      routeSpecific: component.routeSpecific,
      cssSelectors: component.owner.cssSelectors.slice(0, maxStarterSelectors),
      behaviorBindings: component.owner.behaviorBindings.length,
    })),
  };
}

export function behaviorMarkdown(packet: RouteConversionPacket): string {
  const bindings = packet.behaviorBindings.slice(0, maxStarterBehaviorBindings);
  return `# Behavior map: ${packet.routePath}

Source route: ${packet.sourceFile}

${bindings.length ? bindings.map(behaviorBindingMarkdown).join("\n\n") : "No parser-detected behavior bindings for this route."}
`;
}

export function readmeMarkdown(report: ProjectReport, packet: RouteConversionPacket): string {
  return `# Fixer Route Starter Pack

Project: ${report.sourceName}
Route: ${packet.routePath}
Source file: ${packet.sourceFile}

This is a parser-generated starter scaffold. It gives an AI or developer the first file tree, route facts, component boundaries, selector ownership, and behavior notes for one route. It is not a finished React migration.
`;
}

export function aiInstructionsMarkdown(packet: RouteConversionPacket): string {
  return `# AI instructions

Convert the route at ${packet.routePath} using the starter files in this pack.

1. Read source/route-packet.json first.
2. Use source/selector-map.json to move styling intentionally.
3. Use the app page file as the target route shell.
4. Fill component JSX from the source file and locator ranges.
5. Preserve behavior listed in behavior/${packet.slug}-behavior.md.
6. Do not invent missing routes, missing assets, or APIs that are not in the source facts.
`;
}

export function appPagePathForRoute(routePath: string): string {
  const segments = routeSegments(routePath);
  return `${routeStarterPackRoot}/app/${segments.length ? `${segments.join("/")}/` : ""}page.tsx`;
}

export function safeComponentName(value: string): string {
  const name = toPascalCase(value);
  return /^[A-Z]/.test(name) ? name : `Component${name}`;
}

function sourceRangeForComponent(component: RouteStarterComponent): string {
  return component.locator
    ? `${component.locator.sourceFile}:${component.locator.lineStart}-${component.locator.lineEnd}`
    : component.owner.sourceFiles[0] ?? "unknown";
}

function behaviorBindingMarkdown(binding: RouteConversionPacket["behaviorBindings"][number]): string {
  return `## ${binding.event || binding.kind} on ${binding.selector}

- Source: ${binding.sourceFile}:${binding.line}
- Handler: ${binding.handler || "unknown"}
- Component: ${binding.componentName ?? "unassigned"}
- Effects: ${binding.effects.length ? binding.effects.join(", ") : "none detected"}
- Targets: ${binding.targets.length ? binding.targets.join(", ") : "none detected"}
- Endpoints: ${binding.endpoints.length ? binding.endpoints.join(", ") : "none detected"}`;
}

function rootImportPrefix(routePath: string): string {
  return Array(routeSegments(routePath).length + 1).fill("..").join("/");
}

function routeSegments(routePath: string): string[] {
  return routePath
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "route");
}

function tsxString(value: string): string {
  return JSON.stringify(value);
}

function commentText(value: string): string {
  return value.replace(/\*\//g, "* /").replace(/\s+/g, " ").trim().slice(0, 240);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}
