import { useState } from "react";
import { AuthPanel } from "./components/AuthPanel";
import { ExtractionMapPage } from "./components/ExtractionMapPage";
import { MarketingHome } from "./components/MarketingHome";
import { PricingPage } from "./components/PricingPage";
import { ReportPanel } from "./components/ReportPanel";
import { ScanPanel } from "./components/ScanPanel";
import { type AppView, Topbar } from "./components/Topbar";
import { useAuthSession } from "./hooks/useAuthSession";
import { useReportArtifacts } from "./hooks/useReportArtifacts";
import { analyzeStaticZip, type ProcessingStep } from "./scanner/clientStaticAnalyzer";
import type { ProjectReport } from "./scanner/types";

export default function App() {
  const { isLoading, user } = useAuthSession();
  const [activeView, setActiveView] = useState<AppView>(() => (window.location.hash === "#extraction-map" ? "extraction-map" : "home"));
  const [report, setReport] = useState<ProjectReport | null>(() => readStoredReport());
  const [error, setError] = useState<string | null>(null);
  const [archiveFile, setArchiveFile] = useState<File | null>(null);
  const [scanLogs, setScanLogs] = useState<string[]>([]);
  const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>([]);
  const artifacts = useReportArtifacts({ archiveFile, report, appendLog, setError });

  function appendLog(message: string) {
    setScanLogs((logs) => [...logs, `${new Date().toLocaleTimeString()} ${message}`]);
  }

  async function runArchiveScan(file: File) {
    setError(null);
    setReport(null);
    setArchiveFile(file);
    artifacts.resetArtifacts();
    setScanLogs([]);
    setProcessingSteps([]);
    try {
      const nextReport = await analyzeStaticZip(file, file.name, appendLog, appendProcessingStep);
      setReport(nextReport);
      storeReport(nextReport);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "scan failed");
    }
  }

  function appendProcessingStep(step: ProcessingStep) {
    setProcessingSteps((steps) => [...steps, step]);
  }

  if (isLoading) {
    if (activeView === "extraction-map" && report) {
      return <ExtractionMapPage report={report} onBack={() => window.close()} />;
    }

    return (
      <div className="app-shell">
        <Topbar activeView={activeView} onNavigate={setActiveView} />
        <main>
          <p>Loading account...</p>
        </main>
      </div>
    );
  }

  if (!user) {
    const publicPage =
      activeView === "pricing" ? (
        <PricingPage onGetStarted={() => setActiveView("auth")} />
      ) : activeView === "auth" ? (
        <AuthPanel />
      ) : (
        <MarketingHome onGetStarted={() => setActiveView("auth")} onViewPricing={() => setActiveView("pricing")} />
      );

    return (
      <div className="app-shell">
        <Topbar activeView={activeView} onNavigate={setActiveView} />
        {publicPage}
      </div>
    );
  }

  if (activeView === "extraction-map" && report) {
    return <ExtractionMapPage report={report} onBack={() => window.close()} />;
  }

  return (
    <div className="app-shell">
      <Topbar activeView="app" onNavigate={setActiveView} userEmail={user.email} />
      <main className="scan-layout">
        <section>
          <ScanPanel onArchiveScan={runArchiveScan} />
          <div className="panel scan-log">
            <h2>Logs</h2>
            {scanLogs.length ? (
              <ol>
                {scanLogs.map((log) => (
                  <li key={log}>{log}</li>
                ))}
              </ol>
            ) : (
              <p>none</p>
            )}
          </div>
          <div className="panel processing-trace">
            <h2>Trace</h2>
            {processingSteps.length ? (
              <ol>
                {processingSteps.map((step) => (
                  <li key={step.title}>
                    <strong>{step.title}</strong>
                    <p>{step.detail}</p>
                    {step.facts?.length ? (
                      <ul>
                        {step.facts.map((fact) => (
                          <li key={fact}>{fact}</li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p>none</p>
            )}
          </div>
        </section>
        <section>
          {error ? <p className="error-message">{error}</p> : null}
          <ReportPanel
            report={report}
            onOpenExtractionMap={() => openExtractionMap(report)}
            onRunVerifiedRewrite={artifacts.onRunVerifiedRewrite}
            onDownloadVerifiedRewrite={artifacts.onDownloadVerifiedRewrite}
            onBuildAiContextPack={artifacts.onBuildAiContextPack}
            onDownloadAiContextPack={artifacts.onDownloadAiContextPack}
            onBuildMigrationPlan={artifacts.onBuildMigrationPlan}
            onDownloadMigrationPlan={artifacts.onDownloadMigrationPlan}
            onBuildRouteStarter={artifacts.onBuildRouteStarter}
            onDownloadRouteStarter={artifacts.onDownloadRouteStarter}
            onBuildConversionKit={artifacts.onBuildConversionKit}
            onDownloadConversionKit={artifacts.onDownloadConversionKit}
            rewriteResult={artifacts.rewriteResult}
            contextPackResult={artifacts.contextPackResult}
            migrationPlanResult={artifacts.migrationPlanResult}
            routeStarterResult={artifacts.routeStarterResult}
            conversionKitResult={artifacts.conversionKitResult}
            isRewriteAvailable={artifacts.isRewriteAvailable}
            isCheckingRewrite={artifacts.isCheckingRewrite}
            isRewriting={artifacts.isRewriting}
            isContextPackAvailable={artifacts.isContextPackAvailable}
            isRouteStarterAvailable={artifacts.isRouteStarterAvailable}
            isConversionKitAvailable={artifacts.isConversionKitAvailable}
            isBuildingContextPack={artifacts.isBuildingContextPack}
            isBuildingMigrationPlan={artifacts.isBuildingMigrationPlan}
            isBuildingRouteStarter={artifacts.isBuildingRouteStarter}
            isBuildingConversionKit={artifacts.isBuildingConversionKit}
          />
        </section>
      </main>
    </div>
  );
}

function openExtractionMap(report: ProjectReport | null) {
  if (!report) return;
  storeReport(report);
  window.open(`${window.location.origin}${window.location.pathname}#extraction-map`, "_blank", "noopener,noreferrer");
}

function storeReport(report: ProjectReport) {
  localStorage.setItem("fixer:lastReport", JSON.stringify(report));
}

function readStoredReport(): ProjectReport | null {
  if (window.location.hash !== "#extraction-map") return null;
  const storedReport = localStorage.getItem("fixer:lastReport");
  if (!storedReport) return null;

  try {
    return JSON.parse(storedReport) as ProjectReport;
  } catch {
    return null;
  }
}
