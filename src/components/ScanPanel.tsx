import type { DragEvent } from "react";
import { useState } from "react";

interface ScanPanelProps {
  onArchiveScan: (file: File) => void | Promise<void>;
}

export function ScanPanel({ onArchiveScan }: ScanPanelProps) {
  const [isDragging, setIsDragging] = useState(false);

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
