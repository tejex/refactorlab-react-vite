import type { ZipFileInput } from "./zipWriter";
import type { ComponentOwnership, RouteConversionPacket } from "./types";

export const routeStarterPackRoot = "fixer-route-starter-pack";
export const maxStarterComponents = 12;
export const maxStarterSelectors = 36;
export const maxStarterBehaviorBindings = 40;

export type RouteStarterLocator = ComponentOwnership["locators"][number];

export interface RouteStarterComponent {
  name: string;
  owner: ComponentOwnership;
  locator: RouteStarterLocator | null;
  routeSpecific: boolean;
}

export interface RouteStarterPackStats {
  routePath: string;
  sourceFile: string;
  pageComponentName: string;
  components: number;
  behaviorBindings: number;
  cssSelectors: number;
  assets: number;
  blockers: number;
  outputFiles: number;
}

export interface RouteStarterPackManifest {
  source: string;
  generatedAt: string;
  purpose: string;
  recommendedUse: string[];
  route: {
    path: string;
    sourceFile: string;
    packetSlug: string;
    appPagePath: string;
  };
  stats: RouteStarterPackStats;
  files: string[];
}

export interface RouteStarterPackBuild {
  files: ZipFileInput[];
  manifest: RouteStarterPackManifest;
  stats: RouteStarterPackStats;
  packet: RouteConversionPacket;
}
