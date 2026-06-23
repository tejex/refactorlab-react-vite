export interface ZipFileInput {
  path: string;
  content: string | Uint8Array;
}

const textEncoder = new TextEncoder();
const crcTable = buildCrcTable();

export function downloadZip(files: ZipFileInput[], filename: string) {
  const zipBytes = createStoredZip(files);
  const zipBuffer = zipBytes.buffer.slice(zipBytes.byteOffset, zipBytes.byteOffset + zipBytes.byteLength) as ArrayBuffer;
  const blob = new Blob([zipBuffer], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function createStoredZip(files: ZipFileInput[]): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  const timestamp = dosTimestampFromDate(new Date());
  let offset = 0;

  for (const file of files) {
    const pathBytes = textEncoder.encode(file.path);
    const contentBytes = typeof file.content === "string" ? textEncoder.encode(file.content) : file.content;
    const crc = crc32(contentBytes);
    const localHeader = createLocalHeader(pathBytes, contentBytes, crc, timestamp);
    const centralHeader = createCentralHeader(pathBytes, contentBytes, crc, offset, timestamp);

    localParts.push(localHeader, contentBytes);
    centralParts.push(centralHeader);
    offset += localHeader.byteLength + contentBytes.byteLength;
  }

  const centralOffset = offset;
  const centralSize = centralParts.reduce((total, part) => total + part.byteLength, 0);
  const endRecord = createEndRecord(files.length, centralSize, centralOffset);
  return concatUint8Arrays([...localParts, ...centralParts, endRecord]);
}

interface DosTimestamp {
  time: number;
  date: number;
}

function createLocalHeader(pathBytes: Uint8Array, contentBytes: Uint8Array, crc: number, timestamp: DosTimestamp): Uint8Array {
  const header = new Uint8Array(30 + pathBytes.byteLength);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, timestamp.time, true);
  view.setUint16(12, timestamp.date, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, contentBytes.byteLength, true);
  view.setUint32(22, contentBytes.byteLength, true);
  view.setUint16(26, pathBytes.byteLength, true);
  view.setUint16(28, 0, true);
  header.set(pathBytes, 30);
  return header;
}

function createCentralHeader(pathBytes: Uint8Array, contentBytes: Uint8Array, crc: number, localOffset: number, timestamp: DosTimestamp): Uint8Array {
  const header = new Uint8Array(46 + pathBytes.byteLength);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, timestamp.time, true);
  view.setUint16(14, timestamp.date, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, contentBytes.byteLength, true);
  view.setUint32(24, contentBytes.byteLength, true);
  view.setUint16(28, pathBytes.byteLength, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, localOffset, true);
  header.set(pathBytes, 46);
  return header;
}

function dosTimestampFromDate(date: Date): DosTimestamp {
  const year = Math.min(2107, Math.max(1980, date.getFullYear()));
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function createEndRecord(fileCount: number, centralSize: number, centralOffset: number): Uint8Array {
  const record = new Uint8Array(22);
  const view = new DataView(record.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, fileCount, true);
  view.setUint16(10, fileCount, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, centralOffset, true);
  view.setUint16(20, 0, true);
  return record;
}

function concatUint8Arrays(parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    table[index] = crc >>> 0;
  }
  return table;
}
