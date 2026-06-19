import type { ProjectReport } from "../scanner/types";
import { DeadCodeMapPanel } from "./report/DeadCodeMapPanel";
import { DuplicateCssMapPanel } from "./report/DuplicateCssMapPanel";
import { EvidencePanel } from "./report/EvidencePanel";
import { InlineAssetPlanPanel } from "./report/InlineAssetPlanPanel";
import { JsTsModuleMapPanel } from "./report/JsTsModuleMapPanel";
import { ProjectIntegrityMapPanel } from "./report/ProjectIntegrityMapPanel";
import { ReactConversionMapPanel } from "./report/ReactConversionMapPanel";

interface ReportPanelProps {
  report: ProjectReport | null;
  onOpenExtractionMap?: () => void;
}

export function ReportPanel({ report, onOpenExtractionMap }: ReportPanelProps) {
  if (!report) {
    return (
      <div id="report" className="panel">
        <h2>Report</h2>
        <p>No project scanned yet.</p>
      </div>
    );
  }

  return (
    <div id="report" className="panel">
      <header className="report-header">
        <div>
          <p>Readiness score</p>
          <h2>{report.score}/100</h2>
        </div>
        <div>
          <p>Analyzed source</p>
          <h2>{report.sourceName}</h2>
        </div>
      </header>

      <p className="report-summary">{report.summary}</p>

      {report.evidence ? (
        <details>
          <summary>Facts</summary>
          <EvidencePanel evidence={report.evidence} />
        </details>
      ) : null}

      {report.inlineAssetPlan ? (
        <details open>
          <summary>Extraction</summary>
          <InlineAssetPlanPanel plan={report.inlineAssetPlan} onOpenExtractionMap={onOpenExtractionMap} />
        </details>
      ) : null}

      {report.reactConversionMap ? (
        <section className="analysis-card">
          <h3>AI Conversion Readiness</h3>
          <ReactConversionMapPanel map={report.reactConversionMap} report={report} />
        </section>
      ) : null}

      {report.deadCodeMap ? (
        <section className="analysis-card">
          <h3>Dead Code Map</h3>
          <DeadCodeMapPanel map={report.deadCodeMap} />
        </section>
      ) : null}

      {report.integrityMap ? (
        <section className="analysis-card">
          <h3>Project Integrity Map</h3>
          <ProjectIntegrityMapPanel map={report.integrityMap} />
        </section>
      ) : null}

      {report.jsTsModuleMap ? (
        <section className="analysis-card">
          <h3>JS/TS Module Map</h3>
          <JsTsModuleMapPanel map={report.jsTsModuleMap} />
        </section>
      ) : null}

      {report.duplicateCssMap ? (
        <details open>
          <summary>Duplicate CSS Map</summary>
          <DuplicateCssMapPanel map={report.duplicateCssMap} />
        </details>
      ) : null}
    </div>
  );
}
