import type { ProjectReport, RouteConversionPacket } from "./types";
import type { RouteQueueDifficulty, RouteQueueItem, RouteQueueStatus } from "./conversionKitTypes";

interface RankedPacket {
  packet: RouteConversionPacket;
  score: number;
  difficulty: RouteQueueDifficulty;
}

export function buildConversionRouteQueue(report: ProjectReport): RouteQueueItem[] {
  const packets = report.reactConversionMap?.routePackets ?? [];
  if (!packets.length) return [];

  const primarySlug = report.reactConversionMap?.aiHandoff.primaryRoute?.packetSlug;
  const ranked = packets.map((packet) => rankPacket(packet, primarySlug));
  const startSlug = selectStartSlug(ranked, primarySlug);
  const ordered = ranked.sort((a, b) => packetOrderScore(b, startSlug) - packetOrderScore(a, startSlug) || a.packet.routePath.localeCompare(b.packet.routePath));
  const completedRoutes = new Set<string>();

  return ordered.map((rankedPacket, index) => {
    const item = queueItem(rankedPacket.packet, index + 1, rankedPacket.difficulty, startSlug, completedRoutes, ordered);
    if (item.status !== "blocked") completedRoutes.add(item.routePath);
    return item;
  });
}

function rankPacket(packet: RouteConversionPacket, primarySlug?: string): RankedPacket {
  const difficulty = routeDifficulty(packet);
  const score =
    (packet.slug === primarySlug ? 10_000 : 0) +
    (packet.blockers.length ? -8_000 : 0) +
    sharedOwners(packet).length * 70 +
    packet.componentOwners.length * 30 +
    Math.min(packet.behaviorBindings.length, 6) * 12 -
    Math.max(0, packet.behaviorBindings.length - 6) * 35 -
    (difficulty === "hard" ? 180 : 0);

  return { packet, score, difficulty };
}

function selectStartSlug(ranked: RankedPacket[], primarySlug?: string): string | null {
  const primary = ranked.find((item) => item.packet.slug === primarySlug && !item.packet.blockers.length);
  if (primary) return primary.packet.slug;
  return ranked.filter((item) => !item.packet.blockers.length).sort((a, b) => b.score - a.score)[0]?.packet.slug ?? null;
}

function packetOrderScore(item: RankedPacket, startSlug: string | null): number {
  if (item.packet.slug === startSlug) return 100_000;
  if (item.packet.blockers.length) return -100_000 + item.score;
  if (item.difficulty === "easy") return item.score + 400;
  if (item.difficulty === "medium") return item.score + 200;
  return item.score;
}

function queueItem(
  packet: RouteConversionPacket,
  order: number,
  difficulty: RouteQueueDifficulty,
  startSlug: string | null,
  completedRoutes: Set<string>,
  ordered: RankedPacket[],
): RouteQueueItem {
  const status = routeStatus(packet, difficulty, startSlug);
  return {
    order,
    routePath: packet.routePath,
    sourceFile: packet.sourceFile,
    status,
    difficulty,
    reason: routeReason(packet, status, difficulty),
    packetPath: `ai-context-pack/routes/${packet.slug}.json`,
    starterPath: status === "start" ? "route-starter-pack/" : null,
    componentOwners: packet.componentOwners.length,
    sharedComponentOwners: sharedOwners(packet).length,
    behaviorBindings: packet.behaviorBindings.length,
    blockers: packet.blockers.length,
    dependsOn: routeDependencies(packet, completedRoutes),
    suggestedNext: suggestedNextRoutes(packet, ordered),
    suggestedOrder: packet.suggestedOrder,
  };
}

function routeStatus(packet: RouteConversionPacket, difficulty: RouteQueueDifficulty, startSlug: string | null): RouteQueueStatus {
  if (packet.blockers.length) return "blocked";
  if (packet.slug === startSlug) return "start";
  if (difficulty === "hard" || !packet.componentOwners.length) return "review";
  return "ready";
}

function routeDifficulty(packet: RouteConversionPacket): RouteQueueDifficulty {
  if (packet.blockers.length) return "blocked";
  const complexity = packet.componentOwners.length + packet.behaviorBindings.length * 2 + Math.ceil(packet.cssSelectors.length / 18) + Math.ceil(packet.assets.length / 8);
  if (!packet.componentOwners.length && packet.behaviorBindings.length) return "hard";
  if (complexity <= 8) return "easy";
  if (complexity <= 24) return "medium";
  return "hard";
}

function routeReason(packet: RouteConversionPacket, status: RouteQueueStatus, difficulty: RouteQueueDifficulty): string {
  if (status === "blocked") return `${packet.blockers.length.toLocaleString()} blocker(s) should be fixed before conversion.`;
  if (status === "start") return `Best starting route with ${packet.componentOwners.length.toLocaleString()} owner(s), ${sharedOwners(packet).length.toLocaleString()} shared owner(s), and ${packet.behaviorBindings.length.toLocaleString()} behavior binding(s).`;
  if (status === "review") return `Review before conversion because this route is ${difficulty} or has weak component ownership.`;
  return `Ready after shared pieces are established; ${difficulty} route with no blockers.`;
}

function routeDependencies(packet: RouteConversionPacket, completedRoutes: Set<string>): string[] {
  const dependencies = new Set<string>();
  for (const owner of sharedOwners(packet)) {
    const previousRoute = owner.routesUsedIn.find((route) => route !== packet.routePath && completedRoutes.has(route));
    if (previousRoute) dependencies.add(previousRoute);
  }
  return [...dependencies].sort();
}

function suggestedNextRoutes(packet: RouteConversionPacket, ordered: RankedPacket[]): string[] {
  const family = routeFamily(packet.routePath);
  return ordered
    .map((item) => item.packet)
    .filter((candidate) => candidate.routePath !== packet.routePath && !candidate.blockers.length)
    .filter((candidate) => routeFamily(candidate.routePath) === family || sharesComponent(packet, candidate))
    .slice(0, 3)
    .map((candidate) => candidate.routePath);
}

function sharedOwners(packet: RouteConversionPacket) {
  return packet.componentOwners.filter((owner) => owner.routesUsedIn.length > 1);
}

function sharesComponent(a: RouteConversionPacket, b: RouteConversionPacket): boolean {
  const names = new Set(a.componentOwners.map((owner) => owner.componentName));
  return b.componentOwners.some((owner) => names.has(owner.componentName));
}

function routeFamily(routePath: string): string {
  const [first] = routePath.split("/").filter(Boolean);
  return first ?? "/";
}
