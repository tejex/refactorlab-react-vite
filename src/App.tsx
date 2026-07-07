import { invoke } from "@tauri-apps/api/core";
import { useMemo, useState } from "react";
import type { CostDriver, FileFinding, LanguageStat, RepoScanReport, ScoreDimension } from "./types";

export function App() {
  const [repoPath, setRepoPath] = useState("");
  const [report, setReport] = useState<RepoScanReport | null>(null);
  const [status, setStatus] = useState("Enter a local repository path to run the first Fixer scan.");
  const [isScanning, setIsScanning] = useState(false);

  async function runScan() {
    const path = repoPath.trim();
    if (!path) {
      setStatus("Enter a local folder path first.");
      return;
    }

    setIsScanning(true);
    setStatus("Scanning locally. No source files will be changed.");

    try {
      const nextReport = await invoke<RepoScanReport>("scan_repo", { path });
      setReport(nextReport);
      setStatus("Scan complete. Report saved to local SQLite history.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsScanning(false);
    }
  }

  const expensiveFiles = useMemo(() => report?.largeFiles.length ? report.largeFiles : report?.files.slice(0, 8) ?? [], [report]);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark">Fx</div>
        <h1>Fixer</h1>
        <p>Local AI coding cost estimator for repositories.</p>

        <label htmlFor="repoPath">Local repo path</label>
        <div className="path-row">
          <input
            id="repoPath"
            value={repoPath}
            placeholder="/Users/you/project"
            onChange={(event) => setRepoPath(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void runScan();
            }}
          />
          <button type="button" onClick={() => void runScan()} disabled={isScanning}>
            {isScanning ? "Scanning" : "Scan"}
          </button>
        </div>

        <p className="status">{status}</p>
        <div className="scope-note">
          <strong>V1 boundaries</strong>
          <span>No model calls. No cloud upload. No code changes.</span>
        </div>
      </aside>

      <section className="report-pane">
        {report ? (
          <>
            <header className="report-header">
              <div>
                <p className="eyebrow">AI coding cost report</p>
                <h2>{report.sourcePath}</h2>
              </div>
              <span className="saved-pill">SQLite history saved</span>
            </header>

            <section className="score-grid">
              <HeroScore label="AI Expense" score={report.aiExpenseScore} suffix="/10" />
              <HeroScore label="AI Readiness" score={report.aiReadinessScore} suffix="/100" />
              <ScoreCard label="Context Burden" score={report.contextBurden} />
              <ScoreCard label="Verification Debt" score={report.verificationDebt} />
              <ScoreCard label="Ambiguity Risk" score={report.ambiguityRisk} />
              <ScoreCard label="Blast Radius" score={report.blastRadius} />
              <ScoreCard label="Privacy Risk" score={report.privacyRisk} />
            </section>

            <section className="stat-strip">
              <Metric label="files" value={`${report.totals.analyzedFiles.toLocaleString()} / ${report.totals.files.toLocaleString()}`} />
              <Metric label="lines" value={report.totals.lines.toLocaleString()} />
              <Metric label="tokens" value={report.totals.tokenEstimate.toLocaleString()} />
              <Metric label="ignored" value={report.totals.ignoredFiles.toLocaleString()} />
            </section>

            <section className="content-grid">
              <Panel title="Top Cost Drivers">
                {report.topCostDrivers.map((driver) => <Driver driver={driver} key={driver.id} />)}
              </Panel>

              <Panel title="Build / Test / Typecheck">
                <ScriptGroup label="Build" values={report.scripts.build} />
                <ScriptGroup label="Test" values={report.scripts.test} />
                <ScriptGroup label="Typecheck" values={report.scripts.typecheck} />
              </Panel>

              <Panel title="Language Breakdown">
                {report.languages.slice(0, 8).map((language) => <LanguageRow language={language} key={language.extension} />)}
              </Panel>

              <Panel title="Large / Expensive Files">
                {expensiveFiles.length ? expensiveFiles.map((file) => <FileRow file={file} key={file.path} />) : <p>No expensive files detected.</p>}
              </Panel>
            </section>
          </>
        ) : (
          <div className="empty-state">
            <h2>Scan a local repo</h2>
            <p>Fixer will estimate AI coding cost, readiness, context burden, verification debt, ambiguity, blast radius, and privacy risk.</p>
          </div>
        )}
      </section>
    </main>
  );
}

function HeroScore({ label, score, suffix }: { label: string; score: ScoreDimension; suffix: string }) {
  return (
    <article className={`hero-score ${score.level}`}>
      <span>{label}</span>
      <strong>{score.value}<small>{suffix}</small></strong>
      <p>{score.reasons[0]}</p>
    </article>
  );
}

function ScoreCard({ label, score }: { label: string; score: ScoreDimension }) {
  return (
    <article className={`score-card ${score.level}`}>
      <span>{label}</span>
      <strong>{score.value}</strong>
      <p>{score.reasons[0]}</p>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <h3>{title}</h3>
      <div className="panel-body">{children}</div>
    </section>
  );
}

function Driver({ driver }: { driver: CostDriver }) {
  return (
    <article className={`driver ${driver.impact}`}>
      <div>
        <strong>{driver.title}</strong>
        <span>{driver.impact}</span>
      </div>
      <p>{driver.reason}</p>
      <ul>{driver.evidence.map((item) => <li key={item}>{item}</li>)}</ul>
    </article>
  );
}

function ScriptGroup({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="script-group">
      <strong>{label}</strong>
      {values.length ? values.map((value) => <span key={value}>{value}</span>) : <span className="missing">Not detected</span>}
    </div>
  );
}

function LanguageRow({ language }: { language: LanguageStat }) {
  return (
    <div className="row-line">
      <strong>{language.language}</strong>
      <span>{language.files.toLocaleString()} files · {language.lines.toLocaleString()} lines · {language.tokenEstimate.toLocaleString()} tokens</span>
    </div>
  );
}

function FileRow({ file }: { file: FileFinding }) {
  return (
    <div className="row-line">
      <strong>{file.path}</strong>
      <span>{file.lineCount.toLocaleString()} lines · {file.tokenEstimate.toLocaleString()} tokens · {file.flags.join(", ") || "no flags"}</span>
    </div>
  );
}
