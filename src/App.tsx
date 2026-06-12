import { useState } from "react";
import { HowItWorks } from "./components/HowItWorks";
import { ReportPanel } from "./components/ReportPanel";
import { ScanPanel } from "./components/ScanPanel";
import { Topbar } from "./components/Topbar";
import { analyzeProject } from "./scanner/analyzeProject";
import type { ProjectReport, SourceType } from "./scanner/types";

export default function App() {
  const [report, setReport] = useState<ProjectReport | null>(null);

  function runScan(sourceName: string, sourceType: SourceType) {
    setReport(analyzeProject({ sourceName, sourceType }));
  }

  return (
    <div className="shell">
      <Topbar />
      <main className="workspace">
        <ScanPanel onScan={runScan} />
        <ReportPanel report={report} />
      </main>
      <HowItWorks />
    </div>
  );
}
