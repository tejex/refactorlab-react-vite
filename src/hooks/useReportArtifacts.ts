import { useState } from "react";
import { buildAiContextPackArchive, downloadAiContextPackArchive, type AiContextPackBuild } from "../scanner/aiContextPack";
import { buildConversionKitArchive, downloadConversionKitArchive, type ConversionKitBuild } from "../scanner/conversionKit";
import { buildMigrationPlanPack, downloadMigrationPlanPack, type MigrationPlanPackBuild } from "../scanner/migrationPlanPack";
import { buildRouteStarterPack, downloadRouteStarterPack, type RouteStarterPackBuild } from "../scanner/routeStarterPack";
import type { ProjectReport } from "../scanner/types";
import { buildVerifiedRewriteArchive, downloadVerifiedRewriteArchive, type VerifiedRewriteArchive } from "../scanner/verifiedRewriteEngine";

interface UseReportArtifactsInput {
  archiveFile: File | null;
  report: ProjectReport | null;
  appendLog: (message: string) => void;
  setError: (message: string | null) => void;
}

export function useReportArtifacts({ archiveFile, report, appendLog, setError }: UseReportArtifactsInput) {
  const [rewriteResult, setRewriteResult] = useState<VerifiedRewriteArchive | null>(null);
  const [contextPackResult, setContextPackResult] = useState<AiContextPackBuild | null>(null);
  const [migrationPlanResult, setMigrationPlanResult] = useState<MigrationPlanPackBuild | null>(null);
  const [routeStarterResult, setRouteStarterResult] = useState<RouteStarterPackBuild | null>(null);
  const [conversionKitResult, setConversionKitResult] = useState<ConversionKitBuild | null>(null);
  const [isCheckingRewrite, setIsCheckingRewrite] = useState(false);
  const [isRewriting, setIsRewriting] = useState(false);
  const [isBuildingContextPack, setIsBuildingContextPack] = useState(false);
  const [isBuildingMigrationPlan, setIsBuildingMigrationPlan] = useState(false);
  const [isBuildingRouteStarter, setIsBuildingRouteStarter] = useState(false);
  const [isBuildingConversionKit, setIsBuildingConversionKit] = useState(false);

  function resetArtifacts() {
    setRewriteResult(null);
    setContextPackResult(null);
    setMigrationPlanResult(null);
    setRouteStarterResult(null);
    setConversionKitResult(null);
  }

  async function runVerifiedRewriteCheck() {
    if (!archiveFile || !report) return;
    setError(null);
    setIsCheckingRewrite(true);
    try {
      setRewriteResult(await buildVerifiedRewriteArchive(archiveFile, report, appendLog));
    } catch (rewriteError) {
      setRewriteResult(null);
      setError(rewriteError instanceof Error ? rewriteError.message : "rewrite check failed");
    } finally {
      setIsCheckingRewrite(false);
    }
  }

  async function downloadVerifiedRewrite() {
    if (!archiveFile || !report) return;
    setError(null);
    setIsRewriting(true);
    try {
      setRewriteResult(await downloadVerifiedRewriteArchive(archiveFile, report, appendLog));
    } catch (rewriteError) {
      setError(rewriteError instanceof Error ? rewriteError.message : "rewrite failed");
    } finally {
      setIsRewriting(false);
    }
  }

  async function buildAiContextPack() {
    if (!archiveFile || !report) return;
    setError(null);
    setIsBuildingContextPack(true);
    try {
      setContextPackResult(await buildAiContextPackArchive(archiveFile, report, appendLog));
    } catch (contextPackError) {
      setContextPackResult(null);
      setError(contextPackError instanceof Error ? contextPackError.message : "context pack build failed");
    } finally {
      setIsBuildingContextPack(false);
    }
  }

  async function downloadAiContextPack() {
    if (!archiveFile || !report) return;
    setError(null);
    setIsBuildingContextPack(true);
    try {
      setContextPackResult(await downloadAiContextPackArchive(archiveFile, report, appendLog));
    } catch (contextPackError) {
      setError(contextPackError instanceof Error ? contextPackError.message : "context pack download failed");
    } finally {
      setIsBuildingContextPack(false);
    }
  }

  async function buildMigrationPlan() {
    if (!report) return;
    setError(null);
    setIsBuildingMigrationPlan(true);
    try {
      const result = buildMigrationPlanPack(report);
      appendLog(`migrationPhases=${result.stats.phases.toLocaleString()}`);
      appendLog(`migrationBlockers=${result.stats.blockers.toLocaleString()}`);
      setMigrationPlanResult(result);
    } catch (migrationPlanError) {
      setMigrationPlanResult(null);
      setError(migrationPlanError instanceof Error ? migrationPlanError.message : "migration plan build failed");
    } finally {
      setIsBuildingMigrationPlan(false);
    }
  }

  async function downloadMigrationPlan() {
    if (!report) return;
    setError(null);
    setIsBuildingMigrationPlan(true);
    try {
      const result = downloadMigrationPlanPack(report);
      appendLog(`migrationPlanFiles=${result.stats.outputFiles.toLocaleString()}`);
      setMigrationPlanResult(result);
    } catch (migrationPlanError) {
      setError(migrationPlanError instanceof Error ? migrationPlanError.message : "migration plan download failed");
    } finally {
      setIsBuildingMigrationPlan(false);
    }
  }

  async function buildRouteStarter() {
    if (!report) return;
    setError(null);
    setIsBuildingRouteStarter(true);
    try {
      const result = buildRouteStarterPack(report);
      appendLog(`routeStarterRoute=${result.stats.routePath}`);
      appendLog(`routeStarterFiles=${result.stats.outputFiles.toLocaleString()}`);
      setRouteStarterResult(result);
    } catch (routeStarterError) {
      setRouteStarterResult(null);
      setError(routeStarterError instanceof Error ? routeStarterError.message : "route starter pack build failed");
    } finally {
      setIsBuildingRouteStarter(false);
    }
  }

  async function downloadRouteStarter() {
    if (!report) return;
    setError(null);
    setIsBuildingRouteStarter(true);
    try {
      const result = downloadRouteStarterPack(report);
      appendLog(`routeStarterDownload=${result.stats.routePath}`);
      setRouteStarterResult(result);
    } catch (routeStarterError) {
      setError(routeStarterError instanceof Error ? routeStarterError.message : "route starter pack download failed");
    } finally {
      setIsBuildingRouteStarter(false);
    }
  }

  async function buildConversionKit() {
    if (!archiveFile || !report) return;
    setError(null);
    setIsBuildingConversionKit(true);
    try {
      const result = await buildConversionKitArchive(archiveFile, report, appendLog);
      appendLog(`conversionKitFiles=${result.stats.outputFiles.toLocaleString()}`);
      setConversionKitResult(result);
    } catch (conversionKitError) {
      setConversionKitResult(null);
      setError(conversionKitError instanceof Error ? conversionKitError.message : "conversion kit build failed");
    } finally {
      setIsBuildingConversionKit(false);
    }
  }

  async function downloadConversionKit() {
    if (!archiveFile || !report) return;
    setError(null);
    setIsBuildingConversionKit(true);
    try {
      const result = await downloadConversionKitArchive(archiveFile, report, appendLog);
      appendLog(`conversionKitDownload=${result.stats.outputFiles.toLocaleString()} files`);
      setConversionKitResult(result);
    } catch (conversionKitError) {
      setError(conversionKitError instanceof Error ? conversionKitError.message : "conversion kit download failed");
    } finally {
      setIsBuildingConversionKit(false);
    }
  }

  return {
    resetArtifacts,
    rewriteResult,
    contextPackResult,
    migrationPlanResult,
    routeStarterResult,
    conversionKitResult,
    isRewriteAvailable: Boolean(archiveFile),
    isContextPackAvailable: Boolean(archiveFile),
    isRouteStarterAvailable: Boolean(report?.reactConversionMap?.routePackets.length),
    isConversionKitAvailable: Boolean(archiveFile && report?.reactConversionMap?.routePackets.length),
    isCheckingRewrite,
    isRewriting,
    isBuildingContextPack,
    isBuildingMigrationPlan,
    isBuildingRouteStarter,
    isBuildingConversionKit,
    onRunVerifiedRewrite: runVerifiedRewriteCheck,
    onDownloadVerifiedRewrite: downloadVerifiedRewrite,
    onBuildAiContextPack: buildAiContextPack,
    onDownloadAiContextPack: downloadAiContextPack,
    onBuildMigrationPlan: buildMigrationPlan,
    onDownloadMigrationPlan: downloadMigrationPlan,
    onBuildRouteStarter: buildRouteStarter,
    onDownloadRouteStarter: downloadRouteStarter,
    onBuildConversionKit: buildConversionKit,
    onDownloadConversionKit: downloadConversionKit,
  };
}
