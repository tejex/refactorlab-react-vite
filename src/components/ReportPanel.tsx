import type { ProjectReport, RiskSeverity } from "../scanner/types";

interface ReportPanelProps {
  report: ProjectReport | null;
}

export function ReportPanel({ report }: ReportPanelProps) {
  if (!report) {
    return (
      <section className="report-panel" id="report">
        <div className="report-shell">
          <ReportHeader status="Ready" />
          <div className="empty-state">
            <div>
              <strong>No project scanned yet.</strong>
              <span>Paste a repo URL or upload a compressed project to generate the first report.</span>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="report-panel" id="report">
      <div className="report-shell">
        <ReportHeader status="Preview" />
        <div className="report-body">
          <section className="summary">
            <div className="score">
              <div>
                <strong>{report.score}</strong>
                <span>readiness</span>
              </div>
            </div>
            <div>
              <p className="eyebrow">Analyzed source</p>
              <h2>{report.sourceName}</h2>
              <p>{report.summary}</p>
              <div className="tags">
                {report.stacks.map((stack) => (
                  <span key={stack}>{stack}</span>
                ))}
              </div>
            </div>
          </section>

          <section className="risk-grid">
            {report.risks.map((risk) => (
              <article className="risk-card" key={`${risk.severity}-${risk.title}`}>
                <b className={riskSeverityClass(risk.severity)}>{risk.severity}</b>
                <h3>{risk.title}</h3>
                <p>{risk.body}</p>
              </article>
            ))}
          </section>

          <section className="agent-card">
            <div>
              <p className="eyebrow">AI-agent readiness</p>
              <h3>{report.agentReadiness.score}/100</h3>
            </div>
            <ul>
              {report.agentReadiness.gaps.map((gap) => (
                <li key={gap}>{gap}</li>
              ))}
            </ul>
          </section>

          {report.evidence ? (
            <section className="evidence-panel">
              <p className="eyebrow">Analyzer evidence</p>
              <div className="metric-grid">
                {report.evidence.metrics.map((metric) => (
                  <div className="metric-card" key={metric.label}>
                    <span>{metric.label}</span>
                    <strong>{metric.value}</strong>
                  </div>
                ))}
              </div>

              <div className="evidence-columns">
                <EvidenceList title="Detected clusters" items={report.evidence.clusters} />
                <EvidenceList title="Highest-risk files" items={report.evidence.topFiles} />
              </div>
            </section>
          ) : null}

          <section className="roadmap">
            <p className="eyebrow">Recommended repair path</p>
            {report.roadmap.map(([title, body], index) => (
              <div className="roadmap-step" key={title}>
                <span>{index + 1}</span>
                <div>
                  <strong>{title}</strong>
                  <p>{body}</p>
                </div>
              </div>
            ))}
          </section>
        </div>
      </div>
    </section>
  );
}

function EvidenceList({ title, items }: { title: string; items: { title: string; detail: string }[] }) {
  return (
    <div className="evidence-list">
      <h3>{title}</h3>
      {items.map((item) => (
        <div className="evidence-row" key={item.title}>
          <strong>{item.title}</strong>
          <span>{item.detail}</span>
        </div>
      ))}
    </div>
  );
}

function ReportHeader({ status }: { status: string }) {
  return (
    <div className="report-head">
      <h2>Readiness report</h2>
      <span className="status">{status}</span>
    </div>
  );
}

function riskSeverityClass(severity: RiskSeverity): string {
  if (severity === "Medium") return "medium";
  if (severity === "Info") return "info";
  return "high";
}
