export interface ZipTextFile {
  path: string;
  text: string;
  bytes: number;
}

export interface ZipProjectFiles {
  textFiles: ZipTextFile[];
  allPaths: string[];
}

export interface ZipProjectEntry {
  path: string;
  bytes: Uint8Array;
  text: string | null;
}

export interface ZipProjectEntries {
  entries: ZipProjectEntry[];
  textFiles: ZipTextFile[];
  allPaths: string[];
}

interface ZipEntry {
  path: string;
  compression: number;
  compressedSize: number;
  localHeaderOffset: number;
}

const centralDirectorySignature = 0x02014b50;
const endOfCentralDirectorySignature = 0x06054b50;
const localFileHeaderSignature = 0x04034b50;
const textDecoder = new TextDecoder();

export async function readZipTextFiles(buffer: ArrayBuffer, onLog: (message: string) => void): Promise<ZipTextFile[]> {
  return (await readZipProjectFiles(buffer, onLog)).textFiles;
}

export async function readZipProjectFiles(buffer: ArrayBuffer, onLog: (message: string) => void): Promise<ZipProjectFiles> {
  const project = await readZipProjectEntries(buffer, onLog);
  return {
    textFiles: project.textFiles,
    allPaths: project.allPaths,
  };
}

export async function readZipProjectEntries(buffer: ArrayBuffer, onLog: (message: string) => void): Promise<ZipProjectEntries> {
  const view = new DataView(buffer);
  const eocdOffset = findEndOfCentralDirectory(view);
  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);

  onLog(`zipEntries=${totalEntries.toLocaleString()}`);

  const projectEntries = readCentralDirectory(view, centralDirectoryOffset, totalEntries)
    .filter((entry) => !entry.path.endsWith("/"))
    .filter((entry) => !isIgnoredPath(entry.path));
  const entries = projectEntries.filter((entry) => isAnalyzableSource(entry.path));
  const allPaths = projectEntries.map((entry) => normalizeProjectPath(entry.path)).sort();

  onLog(`sourceFiles=${entries.length.toLocaleString()}`);

  const projectFiles: ZipProjectEntry[] = [];
  for (const entry of projectEntries) {
    const path = normalizeProjectPath(entry.path);
    const bytes = await readEntryBytes(view, entry);
    projectFiles.push({
      path,
      bytes,
      text: isAnalyzableSource(path) ? textDecoder.decode(bytes) : null,
    });
  }

  const textFiles = projectFiles
    .filter((entry): entry is ZipProjectEntry & { text: string } => entry.text !== null)
    .map((entry) => ({ path: entry.path, text: entry.text, bytes: entry.bytes.byteLength }));

  onLog(`decoded=${textFiles.length.toLocaleString()}`);
  return { entries: projectFiles, textFiles, allPaths };
}

function findEndOfCentralDirectory(view: DataView): number {
  const minOffset = Math.max(0, view.byteLength - 0xffff - 22);
  for (let offset = view.byteLength - 22; offset >= minOffset; offset -= 1) {
    if (view.getUint32(offset, true) === endOfCentralDirectorySignature) return offset;
  }

  throw new Error("Could not find ZIP central directory.");
}

function readCentralDirectory(view: DataView, startOffset: number, totalEntries: number): ZipEntry[] {
  const entries: ZipEntry[] = [];
  let offset = startOffset;

  for (let index = 0; index < totalEntries; index += 1) {
    if (view.getUint32(offset, true) !== centralDirectorySignature) {
      throw new Error(`Invalid central directory entry at ${offset}.`);
    }

    const compression = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const path = textDecoder.decode(sliceView(view, offset + 46, fileNameLength));

    entries.push({ path, compression, compressedSize, localHeaderOffset });
    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

async function readEntryBytes(view: DataView, entry: ZipEntry): Promise<Uint8Array> {
  const offset = entry.localHeaderOffset;
  if (view.getUint32(offset, true) !== localFileHeaderSignature) {
    throw new Error(`Invalid local file header for ${entry.path}.`);
  }

  const fileNameLength = view.getUint16(offset + 26, true);
  const extraLength = view.getUint16(offset + 28, true);
  const dataOffset = offset + 30 + fileNameLength + extraLength;
  const compressed = sliceView(view, dataOffset, entry.compressedSize);

  if (entry.compression === 0) return compressed;
  if (entry.compression !== 8) throw new Error(`Unsupported ZIP compression ${entry.compression} for ${entry.path}.`);

  return inflateRaw(compressed);
}

async function inflateRaw(compressed: Uint8Array): Promise<Uint8Array> {
  if (!("DecompressionStream" in globalThis)) {
    throw new Error("This browser does not support DecompressionStream for ZIP analysis.");
  }

  const compressedBuffer = compressed.buffer.slice(compressed.byteOffset, compressed.byteOffset + compressed.byteLength) as ArrayBuffer;
  const stream = new Blob([compressedBuffer]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const inflated = await new Response(stream).arrayBuffer();
  return new Uint8Array(inflated);
}

function sliceView(view: DataView, offset: number, length: number): Uint8Array {
  return new Uint8Array(view.buffer, view.byteOffset + offset, length);
}

function isAnalyzableSource(filePath: string): boolean {
  return [".html", ".css", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts", ".json"].some((extension) =>
    filePath.toLowerCase().endsWith(extension),
  );
}

function isIgnoredPath(filePath: string): boolean {
  const parts = filePath.split("/").filter(Boolean);
  const lowerParts = parts.map((part) => part.toLowerCase());
  const fileName = lowerParts.at(-1) ?? "";

  if (fileName.startsWith(".codex-")) return true;
  if (fileName.startsWith("._")) return true;
  if (fileName === ".ds_store" || fileName === "thumbs.db") return true;
  if (lowerParts.includes(".temp")) return true;

  const ignoredParts = new Set([
    ".git",
    ".github",
    ".cache",
    ".parcel-cache",
    ".turbo",
    ".vercel",
    "node_modules",
    "dist",
    "build",
    "coverage",
    ".next",
    "out",
    ".vite",
    "vendor",
    "__macosx",
  ]);

  return lowerParts.some((part) => ignoredParts.has(part));
}

function normalizeProjectPath(filePath: string): string {
  const parts = filePath.split("/").filter(Boolean);
  if (parts.length > 1 && parts[0]?.toLowerCase().includes("tokensmith")) return parts.slice(1).join("/");
  return parts.join("/");
}
