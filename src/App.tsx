import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { EmptyState } from "./components/EmptyState";
import { ReportView } from "./components/ReportView";
import { ScanProgress } from "./components/ScanProgress";
import type { RepoScanReport } from "./types";

type AppState = "empty" | "scanning" | "report" | "error";

export function App() {
  const [state, setState] = useState<AppState>("empty");
  const [report, setReport] = useState<RepoScanReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  async function chooseProjectFolder() {
    setError(null);
    setExportMessage(null);
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Choose Project Folder",
    });

    if (typeof selected !== "string") {
      return;
    }

    await scanProject(selected);
  }

  async function scanProject(path: string) {
    setState("scanning");
    setError(null);
    setExportMessage(null);

    try {
      const nextReport = await invoke<RepoScanReport>("scan_repo", { path });
      setReport(nextReport);
      setState("report");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setState("error");
    }
  }

  async function rescan() {
    if (!report) return;
    await scanProject(report.repoPath);
  }

  async function exportReport() {
    if (!report) return;
    setExportMessage(null);
    const path = await save({
      title: "Export Fixer Report",
      defaultPath: `${report.repoName}-fixer-report.json`,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });

    if (!path) return;

    try {
      await invoke("export_report", { path, report });
      setExportMessage("Report exported.");
    } catch (caught) {
      setExportMessage(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return (
    <main className="app-shell">
      {state === "scanning" ? <ScanProgress /> : null}

      {state === "empty" || state === "error" ? (
        <EmptyState onChoose={() => void chooseProjectFolder()} error={error} />
      ) : null}

      {state === "report" && report ? (
        <ReportView
          report={report}
          exportMessage={exportMessage}
          onChooseAnother={() => void chooseProjectFolder()}
          onExport={() => void exportReport()}
          onRescan={() => void rescan()}
        />
      ) : null}
    </main>
  );
}
