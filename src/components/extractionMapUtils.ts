import type { GuaranteedSafeChange } from "../scanner/types";

export interface SafeChangeGroup {
  file: string;
  changes: GuaranteedSafeChange[];
  totalLines: number;
  sourceLines: number;
}

export interface GeneratedTreeNode {
  name: string;
  path: string;
  kind: "folder" | "file";
  children: GeneratedTreeNode[];
  change?: GuaranteedSafeChange;
}

export function groupSafeChanges(changes: GuaranteedSafeChange[]): SafeChangeGroup[] {
  const groups = new Map<string, GuaranteedSafeChange[]>();
  for (const change of changes) {
    groups.set(change.file, [...(groups.get(change.file) ?? []), change]);
  }

  return [...groups.entries()]
    .map(([file, groupChanges]) => ({
      file,
      changes: groupChanges.sort((a, b) => a.lineStart - b.lineStart),
      totalLines: groupChanges.reduce((total, change) => total + (change.lineEnd - change.lineStart + 1), 0),
      sourceLines: groupChanges[0]?.sourceLines ?? 0,
    }))
    .sort((a, b) => b.totalLines - a.totalLines || a.file.localeCompare(b.file));
}

export function buildGeneratedTree(changes: GuaranteedSafeChange[]): GeneratedTreeNode {
  const root: GeneratedTreeNode = { name: "/", path: "", kind: "folder", children: [] };

  for (const change of changes) {
    const parts = change.targetPath.replace(/^\/+/, "").split("/").filter(Boolean);
    let current = root;

    parts.forEach((part, index) => {
      const path = [...parts.slice(0, index), part].join("/");
      const isFile = index === parts.length - 1;
      let child = current.children.find((node) => node.name === part);

      if (!child) {
        child = { name: part, path, kind: isFile ? "file" : "folder", children: [] };
        current.children.push(child);
      }
      if (isFile) child.change = change;
      current = child;
    });
  }

  sortGeneratedTree(root);
  return root;
}

export function shortFileName(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

export function folderName(changes: GuaranteedSafeChange[]): string {
  const firstPath = changes[0]?.targetPath ?? "folder";
  return firstPath.replace(/^\/+/, "").split("/").filter(Boolean)[0] ?? "folder";
}

export function proposedFileCountFor(group: SafeChangeGroup): number {
  return new Set(group.changes.map((change) => change.targetPath)).size;
}

function sortGeneratedTree(node: GeneratedTreeNode) {
  node.children.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  node.children.forEach(sortGeneratedTree);
}
