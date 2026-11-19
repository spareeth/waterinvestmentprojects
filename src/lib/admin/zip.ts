// Minimal ZIP writer for the per-country export (M7, PLAN v0.3 0.14). Store only (no compression: teasers are PDF
// and PPTX, already compressed), UTF-8 names, no ZIP64 (the export refuses anything near 4 GB). Node only (zlib.crc32).

import { crc32 } from "node:zlib";

export interface ZipEntry {
  /** Path inside the archive, with forward slashes. */
  name: string;
  data: Uint8Array;
  modifiedAt?: Date;
}

const MAX_ZIP_BYTES = 0xffff_fff0;
const MAX_ENTRIES = 0xffff;

/** MS-DOS date and time, as ZIP stores them (local time fields, 2-second steps). */
function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.min(Math.max(date.getUTCFullYear(), 1980), 2107);
  return {
    time:
      (date.getUTCHours() << 11) |
      (date.getUTCMinutes() << 5) |
      Math.floor(date.getUTCSeconds() / 2),
    date:
      ((year - 1980) << 9) |
      ((date.getUTCMonth() + 1) << 5) |
      date.getUTCDate(),
  };
}

/** A safe archive path: no leading slash, no "..", no control characters. */
export function zipPath(name: string): string {
  const cleaned = name
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.replace(/[\u0000-\u001f\u007f"<>|*?:]/g, "").trim())
    .filter((part) => part !== "" && part !== "." && part !== "..")
    .join("/");
  return cleaned || "file";
}

export function createZip(entries: readonly ZipEntry[]): Uint8Array {
  if (entries.length > MAX_ENTRIES)
    throw new Error("Too many files for one ZIP.");
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  const used = new Set<string>();

  for (const entry of entries) {
    let name = zipPath(entry.name);
    // Two files with the same name: number the later ones.
    if (used.has(name)) {
      const dot = name.lastIndexOf(".");
      const stem = dot > name.lastIndexOf("/") ? name.slice(0, dot) : name;
      const ext = stem === name ? "" : name.slice(dot);
      let n = 2;
      while (used.has(`${stem} (${n})${ext}`)) n += 1;
      name = `${stem} (${n})${ext}`;
    }
    used.add(name);
    const nameBytes = encoder.encode(name);
    const crc = crc32(entry.data) >>> 0;
    const size = entry.data.byteLength;
    const { time, date } = dosDateTime(entry.modifiedAt ?? new Date());

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0x0800, true); // UTF-8 names
    lv.setUint16(8, 0, true); // stored
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);

    locals.push(local, entry.data);
    centrals.push(central);
    offset += local.length + size;
    if (offset > MAX_ZIP_BYTES)
      throw new Error("The export is too large for one ZIP.");
  }

  const centralSize = centrals.reduce((sum, c) => sum + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const out = new Uint8Array(offset + centralSize + end.length);
  let at = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
