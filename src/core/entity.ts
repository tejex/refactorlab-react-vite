export interface ProjectSourceFile {
  path: string;
  text: string;
  bytes?: number;
}

export function normalizeProjectPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "").split("/").filter(Boolean).join("/");
}

export function normalizeProjectPaths(paths: string[]): string[] {
  return [...new Set(paths.map(normalizeProjectPath).filter(Boolean))].sort();
}

export function fileExtension(path: string): string {
  const normalized = normalizeProjectPath(path);
  const index = normalized.lastIndexOf(".");
  return index >= 0 ? normalized.slice(index).toLowerCase() : "";
}

export function dirname(path: string): string {
  const normalized = normalizeProjectPath(path);
  const index = normalized.lastIndexOf("/");
  return index >= 0 ? normalized.slice(0, index) : "";
}

export function joinProjectPath(base: string, target: string): string {
  const normalizedParts: string[] = [];
  for (const part of `${base}/${target}`.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") normalizedParts.pop();
    else normalizedParts.push(part);
  }
  return normalizedParts.join("/");
}

