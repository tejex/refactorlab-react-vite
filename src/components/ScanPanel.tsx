import type { DragEvent, FormEvent } from "react";
import { useState } from "react";
import type { SourceType } from "../scanner/types";

interface ScanPanelProps {
  onArchiveScan: (file: File) => void | Promise<void>;
  onScan: (sourceName: string, sourceType: SourceType) => void | Promise<void>;
}

export function ScanPanel({ onArchiveScan, onScan }: ScanPanelProps) {
  const [repoUrl, setRepoUrl] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onScan(repoUrl.trim(), "github");
  }

  function handleFile(file: File | undefined) {
    if (!file) return;
    onArchiveScan(file);
  }

  function handleDrag(event: DragEvent<HTMLLabelElement>, dragging: boolean) {
    event.preventDefault();
    setIsDragging(dragging);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    handleFile(event.dataTransfer.files[0]);
  }

  return (
    <div id="scan" className="panel">
      <h1>New scan</h1>
      <p>.zip input</p>

      <form onSubmit={handleSubmit}>
        <label htmlFor="repoUrl">repo</label>
        <div className="input-row">
          <input
            id="repoUrl"
            type="url"
            value={repoUrl}
            placeholder="https://github.com/..."
            onChange={(event) => setRepoUrl(event.target.value)}
          />
          <button type="submit">Scan</button>
        </div>
      </form>

      <div>
        <label htmlFor="projectArchive">archive</label>
        <label
          className={`drop-zone${isDragging ? " is-dragging" : ""}`}
          htmlFor="projectArchive"
          onDragEnter={(event) => handleDrag(event, true)}
          onDragOver={(event) => handleDrag(event, true)}
          onDragLeave={(event) => handleDrag(event, false)}
          onDrop={handleDrop}
        >
          .zip
        </label>
        <input
          id="projectArchive"
          type="file"
          accept=".zip,.tar,.gz,.tgz,.tar.gz"
          onChange={(event) => handleFile(event.target.files?.[0])}
        />
      </div>
    </div>
  );
}
