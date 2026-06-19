export function normalizeAssetPath(path: string): string {
  return path.replace(/^\/+/, "");
}

export function isScriptPath(path: string): boolean {
  return /\.(js|jsx|ts|tsx|mjs|cjs|mts|cts)$/i.test(normalizeAssetPath(path));
}

export function dirname(path: string): string {
  const index = path.lastIndexOf("/");
  return index >= 0 ? path.slice(0, index) : "";
}

export function joinProjectPath(base: string, target: string): string {
  const parts = `${base}/${target}`.split("/");
  const normalizedParts: string[] = [];

  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") normalizedParts.pop();
    else normalizedParts.push(part);
  }

  return normalizedParts.join("/");
}

export function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

export function countLines(text: string): number {
  if (!text) return 0;
  return text.split(/\r\n|\r|\n/).length;
}

export function topValues(values: string[], limit: number): string[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value, count]) => `${value}:${count}`);
}
