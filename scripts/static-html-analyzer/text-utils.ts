export function countMatches(content: string, pattern: RegExp): number {
  return [...content.matchAll(pattern)].length;
}

export function matchCaptures(content: string, pattern: RegExp, captureIndex = 1): string[] {
  return [...content.matchAll(pattern)].map((match) => {
    if (captureIndex === 1 && match.length > 2) return match.slice(1).filter(Boolean).join("|");
    return match[captureIndex] ?? "";
  });
}

export function countLines(content: string): number {
  if (!content) return 0;
  return content.split(/\r\n|\r|\n/).length;
}

export function estimateNesting(content: string): number {
  let depth = 0;
  let max = 0;

  for (const char of content) {
    if (char === "{") {
      depth += 1;
      max = Math.max(max, depth);
    } else if (char === "}") {
      depth = Math.max(0, depth - 1);
    }
  }

  return max;
}

export function splitClassList(value: string): string[] {
  return value.split(/\s+/).filter(Boolean);
}

export function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function firstCapture(value: string): string {
  return value.split("|").find(Boolean) ?? "";
}
