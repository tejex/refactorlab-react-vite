export function visitAst(node: unknown, callback: (node: Record<string, unknown>, depth: number) => void, depth = 0): void {
  if (!isObjectNode(node)) return;
  callback(node, depth);

  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((child) => visitAst(child, callback, depth + 1));
    else if (isObjectNode(value) && typeof value.type === "string") visitAst(value, callback, depth + 1);
  }
}

export function isObjectNode(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

export function isIdentifierNode(value: unknown): value is { type: "Identifier"; name: string } {
  return isObjectNode(value) && value.type === "Identifier" && typeof value.name === "string";
}

export function hasNamedId(node: Record<string, unknown>): node is Record<string, unknown> & { id: { name: string } } {
  return isObjectNode(node.id) && typeof node.id.name === "string";
}

export function hasStringSource(node: Record<string, unknown>): node is Record<string, unknown> & { source: { value: string } } {
  return isObjectNode(node.source) && typeof node.source.value === "string";
}
