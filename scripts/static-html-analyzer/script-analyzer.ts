import { parse } from "@babel/parser";
import { hasNamedId, hasStringSource, isIdentifierNode, visitAst } from "./ast-utils.ts";
import { scoreFile } from "./scoring.ts";
import type { FileAnalysis, ScriptParseResult, TreeSummary } from "./types.ts";
import { firstCapture, matchCaptures, unique } from "./text-utils.ts";

export function analyzeScript(analysis: FileAnalysis, content: string): FileAnalysis {
  const parsed = parseScript(content);
  const functionNames = extractFunctionNames(content);
  const imports = extractImports(content);
  const selectors = extractDomSelectors(content);
  const events = matchCaptures(content, /addEventListener\(["']([^"']+)["']/g);
  const globals = matchCaptures(content, /\b(window|document|localStorage|sessionStorage|location|history)\b/g);

  analysis.symbols = unique([...functionNames, ...parsed.symbols]);
  analysis.imports = unique([...imports, ...parsed.imports]);
  analysis.selectors = unique(selectors).slice(0, 120);
  analysis.eventHandlers = unique(events);
  analysis.tree = parsed.tree;
  analysis.complexity.fanOut = analysis.imports.length + analysis.selectors.length + analysis.eventHandlers.length;
  analysis.riskScore = scoreFile(analysis, {
    sizeWeight: 1,
    extra: parsed.parseFailed ? 20 : 0,
  });

  addScriptNotes(analysis, parsed.parseFailed, globals.length);
  return analysis;
}

function parseScript(content: string): ScriptParseResult {
  try {
    const ast = parse(content, {
      sourceType: "unambiguous",
      plugins: ["typescript", "jsx"],
      errorRecovery: true,
    });
    const symbols: string[] = [];
    const imports: string[] = [];
    const tree = summarizeScriptTree(ast.program);

    visitAst(ast.program, (node) => {
      if (node.type === "FunctionDeclaration" && hasNamedId(node)) symbols.push(node.id.name);
      if (node.type === "ClassDeclaration" && hasNamedId(node)) symbols.push(node.id.name);
      if (node.type === "VariableDeclarator" && isIdentifierNode(node.id)) symbols.push(node.id.name);
      if (node.type === "ImportDeclaration" && hasStringSource(node)) imports.push(node.source.value);
    });

    return { parseFailed: false, symbols, imports, tree };
  } catch {
    return { parseFailed: true, symbols: [], imports: [] };
  }
}

function summarizeScriptTree(program: unknown): TreeSummary {
  const counts = new Map<string, number>();
  let nodes = 0;
  let maxDepth = 0;

  visitAst(program, (node, depth) => {
    const type = String(node.type ?? "unknown");
    nodes += 1;
    maxDepth = Math.max(maxDepth, depth);
    counts.set(type, (counts.get(type) ?? 0) + 1);
  });

  return {
    parser: "babel",
    nodes,
    maxDepth,
    topNodeTypes: [...counts.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12),
  };
}

function extractFunctionNames(content: string): string[] {
  return matchCaptures(
    content,
    /\b(?:function\s+([A-Za-z_$][\w$]*)|const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(|let\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\()/g,
  )
    .map(firstCapture)
    .filter(Boolean);
}

function extractImports(content: string): string[] {
  return [
    ...matchCaptures(content, /\bimport\s+(?:[^"']+from\s+)?["']([^"']+)["']/g),
    ...matchCaptures(content, /\brequire\(["']([^"']+)["']\)/g),
  ];
}

function extractDomSelectors(content: string): string[] {
  return matchCaptures(content, /querySelector(?:All)?\(["']([^"']+)["']\)|getElementById\(["']([^"']+)["']\)/g)
    .map(firstCapture)
    .filter(Boolean);
}

function addScriptNotes(analysis: FileAnalysis, parseFailed: boolean, globals: number): void {
  if (parseFailed) analysis.notes.push("Script parse failed; regex fallback used.");
  if (analysis.lines > 700) analysis.notes.push("Oversized script; good candidate for function-level clustering.");
  if (globals > 20) analysis.notes.push("Heavy browser-global usage; extraction must preserve runtime context.");
  if (analysis.sideEffects.dom > 15) analysis.notes.push("High DOM coupling; separate selectors/rendering/events carefully.");
}
