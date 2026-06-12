import type { DragEvent, FormEvent } from "react";
import { useState } from "react";
import type { SourceType } from "../scanner/types";

interface ScanPanelProps {
  onScan: (sourceName: string, sourceType: SourceType) => void;
}

export function ScanPanel({ onScan }: ScanPanelProps) {
  const [repoUrl, setRepoUrl] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onScan(repoUrl.trim() || "https://github.com/founder/lovable-supabase-app", "github");
  }

  function handleFile(file: File | undefined) {
    if (!file) return;
    onScan(file.name, "archive");
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
    <section className="scan-panel" id="scan">
      <p className="eyebrow">AI-built app rehabilitation</p>
      <h1>Turn vibe-coded apps into structured, scalable codebases.</h1>
      <p className="intro">
        Paste a GitHub repo or drop a compressed project. fixer.ai classifies the repo shape,
        finds structural risk, and creates a cleanup plan for humans and future AI coding agents.
      </p>

      <form className="repo-form" onSubmit={handleSubmit}>
        <label htmlFor="repoUrl">GitHub repository</label>
        <div className="input-row">
          <input
            id="repoUrl"
            type="url"
            value={repoUrl}
            placeholder="https://github.com/founder/ai-built-app"
            onChange={(event) => setRepoUrl(event.target.value)}
          />
          <button type="submit">Scan repo</button>
        </div>
      </form>

      <div className="upload-block">
        <label htmlFor="projectArchive">Compressed project</label>
        <label
          className={`drop-zone${isDragging ? " dragging" : ""}`}
          htmlFor="projectArchive"
          onDragEnter={(event) => handleDrag(event, true)}
          onDragOver={(event) => handleDrag(event, true)}
          onDragLeave={(event) => handleDrag(event, false)}
          onDrop={handleDrop}
        >
          <span className="upload-mark">+</span>
          <strong>Drop a .zip, .tar, or .tar.gz here</strong>
          <span>Use this for private exports, Lovable sync folders, or static products like Tokensmith.</span>
        </label>
        <input
          id="projectArchive"
          type="file"
          accept=".zip,.tar,.gz,.tgz,.tar.gz"
          onChange={(event) => handleFile(event.target.files?.[0])}
        />
      </div>

      <div className="target-grid">
        <div>
          <strong>Lovable-style apps</strong>
          <span>React, Vite, Tailwind, Supabase, GitHub sync.</span>
        </div>
        <div>
          <strong>Messy web repos</strong>
          <span>Static HTML, JS, CSS, Workers, Node, mixed stacks.</span>
        </div>
      </div>

      <button className="sample-button" type="button" onClick={() => onScan("tokensmith-main", "archive")}>
        Load TokenSmith sample
      </button>
    </section>
  );
}
