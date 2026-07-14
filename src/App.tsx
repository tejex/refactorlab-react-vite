import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { EmptyState } from "./components/EmptyState";
import { ReportView } from "./components/ReportView";
import { ScanFailure } from "./components/ScanFailure";
import { ScanProgress } from "./components/ScanProgress";
import {
  packetActionFeedback,
  type ActionFeedback,
  type PacketAction,
} from "./components/resultsModel";
import type { RepoScanReport } from "./types";

type AppState = "empty" | "scanning" | "report" | "error";

export function App() {
  const [state, setState] = useState<AppState>("empty");
  const [report, setReport] = useState<RepoScanReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSelectedPath, setLastSelectedPath] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<PacketAction | null>(null);
  const [actionFeedback, setActionFeedback] = useState<ActionFeedback | null>(null);

  async function chooseProjectFolder() {
    if (activeAction) return;

    setError(null);
    setActionFeedback(null);
    setActiveAction("choosing");

    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Choose Project Folder",
      });

      if (typeof selected !== "string") {
        setActiveAction(null);
        return;
      }

      await scanProject(selected);
    } catch {
      setError("The repository picker could not be opened.");
      setState("error");
      setActiveAction(null);
    }
  }

  async function scanProject(path: string) {
    setLastSelectedPath(path);
    setState("scanning");
    setActiveAction("scanning");
    setError(null);
    setActionFeedback(null);

    try {
      const nextReport = await invoke<RepoScanReport>("scan_repo", { path });
      setReport(nextReport);
      setState("report");
      setActionFeedback({ kind: "success", message: "Scan complete" });
    } catch {
      setError("The repository scan did not complete. No new report was published.");
      setState("error");
    } finally {
      setActiveAction(null);
    }
  }

  async function rescan() {
    if (!report) return;
    await scanProject(report.repoPath);
  }

  async function downloadPacket() {
    if (!report || activeAction) return;
    setActionFeedback(null);
    setActiveAction("downloading");

    try {
      const path = await save({
        title: "Download Repository Packet",
        defaultPath: report.repoName + "-repository-context.md",
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });

      if (!path) return;
      await invoke("export_packet", { path, report });
      setActionFeedback(packetActionFeedback("download", "success"));
    } catch {
      setActionFeedback(packetActionFeedback("download", "error"));
    } finally {
      setActiveAction(null);
    }
  }

  async function copyPacket() {
    if (!report || activeAction) return;
    setActionFeedback(null);
    setActiveAction("copying");

    try {
      await invoke("copy_packet", { report });
      setActionFeedback(packetActionFeedback("copy", "success"));
    } catch {
      setActionFeedback(packetActionFeedback("copy", "error"));
    } finally {
      setActiveAction(null);
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground antialiased">
      {state === "scanning" ? <ScanProgress /> : null}

      {state === "empty" ? (
        <EmptyState
          busy={activeAction === "choosing"}
          onChoose={() => void chooseProjectFolder()}
        />
      ) : null}

      {state === "error" ? (
        <ScanFailure
          busy={activeAction !== null}
          canRetry={Boolean(lastSelectedPath)}
          error={error}
          hasPreviousReport={Boolean(report)}
          onChooseAnother={() => void chooseProjectFolder()}
          onRetry={() => {
            if (lastSelectedPath) void scanProject(lastSelectedPath);
          }}
          onUsePrevious={() => setState("report")}
        />
      ) : null}

      {state === "report" && report ? (
        <ReportView
          report={report}
          activeAction={activeAction}
          actionFeedback={actionFeedback}
          onChooseAnother={() => void chooseProjectFolder()}
          onCopyPacket={() => void copyPacket()}
          onDownloadPacket={() => void downloadPacket()}
          onRescan={() => void rescan()}
        />
      ) : null}
    </main>
  );
}
