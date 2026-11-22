import "server-only";
import { inflateRawSync } from "node:zlib";

// Text of a teaser in an office format (22 Nov, user request: read the project details from every format except
// images). No extra library: Word, PowerPoint and Excel (.docx, .pptx, .xlsx) and OpenDocument (.odt, .odp, .ods)
// are ZIP packages of XML, read here with Node's zlib; RTF is plain text with control words; the old binary
// formats (.doc, .ppt, .xls) get a best-effort read of the text runs they contain. Sizes are capped against
// "zip bombs", and any failure gives no text: the upload itself never depends on it.

const MAX_PART_BYTES = 8 * 1024 * 1024;
const MAX_ENTRIES = 5000;
const MAX_TEXT = 60_000;

// ---------------------------------------------------------------------------
// ZIP (read only the parts named)
// ---------------------------------------------------------------------------

type ZipParts = Map<string, () => Uint8Array | null>;

function readZip(bytes: Uint8Array): ZipParts {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const parts: ZipParts = new Map();
  // End of central directory: in the last 64 KB plus its own 22 bytes.
  let eocd = -1;
  for (
    let i = bytes.length - 22;
    i >= Math.max(0, bytes.length - 65_557);
    i--
  ) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return parts;
  const count = Math.min(view.getUint16(eocd + 10, true), MAX_ENTRIES);
  let at = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  for (let n = 0; n < count && at + 46 <= bytes.length; n++) {
    if (view.getUint32(at, true) !== 0x02014b50) break;
    const method = view.getUint16(at + 10, true);
    const compressed = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extraLength + commentLength;
    parts.set(name, () => {
      if (size > MAX_PART_BYTES || local + 30 > bytes.length) return null;
      if (view.getUint32(local, true) !== 0x04034b50) return null;
      const start =
        local +
        30 +
        view.getUint16(local + 26, true) +
        view.getUint16(local + 28, true);
      const data = bytes.subarray(start, start + compressed);
      if (method === 0) return data;
      if (method === 8) {
        return new Uint8Array(
          inflateRawSync(data, { maxOutputLength: MAX_PART_BYTES }),
        );
      }
      return null;
    });
  }
  return parts;
}

function part(parts: ZipParts, name: string): string | null {
  const read = parts.get(name);
  const data = read ? read() : null;
  return data ? new TextDecoder().decode(data) : null;
}

// ---------------------------------------------------------------------------
// XML to text
// ---------------------------------------------------------------------------

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeChar(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function safeChar(code: number): string {
  return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : " ";
}

/** Paragraph ends become new lines; tabs and breaks too; every other tag goes. */
function xmlText(xml: string, paragraphEnds: RegExp, breaks: RegExp): string {
  return decodeEntities(
    xml
      .replace(paragraphEnds, "\n")
      .replace(breaks, "\n")
      .replace(/<[^>]+>/g, ""),
  );
}

function docxText(parts: ZipParts): string | null {
  const xml = part(parts, "word/document.xml");
  return xml ? xmlText(xml, /<\/w:p>/g, /<w:(br|cr|tab)\b[^>]*\/>/g) : null;
}

function pptxText(parts: ZipParts): string | null {
  const slides = [...parts.keys()]
    .map((name) => /^ppt\/slides\/slide(\d+)\.xml$/.exec(name))
    .filter((m): m is RegExpExecArray => m !== null)
    .sort((a, b) => Number(a[1]) - Number(b[1]))
    .slice(0, 2);
  const texts = slides
    .map((m) => part(parts, m[0]))
    .filter((x): x is string => x !== null)
    .map((xml) => xmlText(xml, /<\/a:p>/g, /<a:br\b[^>]*\/>/g));
  return texts.length ? texts.join("\n") : null;
}

/** First sheet, cell by cell in reading order, one cell per line (a label and its value stay next to each other). */
function xlsxText(parts: ZipParts): string | null {
  const shared: string[] = [];
  const sst = part(parts, "xl/sharedStrings.xml");
  if (sst) {
    for (const m of sst.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
      shared.push(decodeEntities(m[1].replace(/<[^>]+>/g, "")));
    }
  }
  const sheetName = [...parts.keys()]
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => Number(/\d+/.exec(a)![0]) - Number(/\d+/.exec(b)![0]))[0];
  const sheet = sheetName ? part(parts, sheetName) : null;
  if (!sheet) return shared.length ? shared.join("\n") : null;
  const lines: string[] = [];
  for (const m of sheet.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attrs = m[1];
    const body = m[2] ?? "";
    const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
    if (type === "s") {
      const v = /<v>(\d+)<\/v>/.exec(body);
      if (v) lines.push(shared[Number(v[1])] ?? "");
    } else if (type === "inlineStr") {
      lines.push(decodeEntities(body.replace(/<[^>]+>/g, "")));
    } else {
      const v = /<v>([^<]*)<\/v>/.exec(body);
      if (v) lines.push(decodeEntities(v[1]));
    }
  }
  return lines.join("\n");
}

function odfText(parts: ZipParts): string | null {
  const xml = part(parts, "content.xml");
  return xml
    ? xmlText(
        xml,
        /<\/text:(p|h)>|<\/table:table-cell>/g,
        /<text:(line-break|tab|s)\b[^>]*\/>/g,
      )
    : null;
}

// ---------------------------------------------------------------------------
// RTF and the old binary formats
// ---------------------------------------------------------------------------

const RTF_SKIP = new Set([
  "fonttbl",
  "colortbl",
  "stylesheet",
  "info",
  "pict",
  "header",
  "footer",
  "listtable",
  "listoverridetable",
  "rsidtbl",
  "generator",
  "themedata",
  "datastore",
  "latentstyles",
]);

/** Removes the groups that hold no visible text (tables, pictures, "\*" destinations), nested ones included. */
function stripRtfGroups(rtf: string): string {
  let out = "";
  let i = 0;
  while (i < rtf.length) {
    const c = rtf[i];
    if (c === "\\" && i + 1 < rtf.length) {
      out += c + rtf[i + 1];
      i += 2;
      continue;
    }
    if (c === "{") {
      const head = /^\{\\(\*|[a-z]+)/i.exec(rtf.slice(i, i + 40));
      if (head && (head[1] === "*" || RTF_SKIP.has(head[1].toLowerCase()))) {
        // Skip to the matching brace.
        let depth = 0;
        for (; i < rtf.length; i++) {
          if (rtf[i] === "\\") {
            i++;
            continue;
          }
          if (rtf[i] === "{") depth++;
          else if (rtf[i] === "}" && --depth === 0) break;
        }
        i++;
        continue;
      }
    }
    out += c;
    i++;
  }
  return out;
}

function rtfText(bytes: Uint8Array): string {
  const rtf = stripRtfGroups(new TextDecoder("latin1").decode(bytes));
  return rtf
    .replace(/\\(par|line|row|cell)\b ?/g, "\n")
    .replace(/\\tab\b ?/g, " ")
    .replace(/\\'([0-9a-f]{2})/gi, (_, h) =>
      String.fromCharCode(parseInt(h, 16)),
    )
    .replace(/\\u(-?\d+)\??/g, (_, n) => {
      const code = Number(n) < 0 ? Number(n) + 65536 : Number(n);
      return safeChar(code);
    })
    .replace(/\\[a-z]+-?\d* ?/gi, "")
    .replace(/\\([{}\\])/g, "$1")
    .replace(/[{}]/g, "");
}

/**
 * Old Word, PowerPoint and Excel files (OLE2): their text is stored as runs of UTF-16 or 8-bit characters. This
 * keeps the readable runs (at least four characters) as lines. Good enough for labelled teasers, not more.
 */
function binaryOfficeText(bytes: Uint8Array): string {
  const runs: string[] = [];
  const printable = (c: number) =>
    (c >= 0x20 && c < 0x7f) ||
    (c >= 0xa0 && c <= 0x24f) ||
    c === 0x2013 ||
    c === 0x2014 ||
    c === 0x2019;
  // UTF-16 little-endian runs.
  let run = "";
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const c = bytes[i] | (bytes[i + 1] << 8);
    if (printable(c)) run += String.fromCharCode(c);
    else {
      if (c === 0x0d || c === 0x0b || c === 0x07) run += "\n";
      else {
        if (run.trim().length >= 4) runs.push(run);
        run = "";
      }
    }
  }
  if (run.trim().length >= 4) runs.push(run);
  // 8-bit runs (cp1252 text in older files).
  run = "";
  for (const b of bytes) {
    if ((b >= 0x20 && b < 0x7f) || b >= 0xa0) run += String.fromCharCode(b);
    else if (b === 0x0d || b === 0x0b) run += "\n";
    else {
      if (run.trim().length >= 4) runs.push(run);
      run = "";
    }
  }
  if (run.trim().length >= 4) runs.push(run);
  return runs.join("\n");
}

// ---------------------------------------------------------------------------

/** The text of an office or RTF teaser, or null (unknown type, unreadable file). */
export function documentText(bytes: Uint8Array, type: string): string | null {
  try {
    let text: string | null = null;
    switch (type) {
      case "docx":
        text = docxText(readZip(bytes));
        break;
      case "pptx":
        text = pptxText(readZip(bytes));
        break;
      case "xlsx":
        text = xlsxText(readZip(bytes));
        break;
      case "odt":
      case "odp":
      case "ods":
        text = odfText(readZip(bytes));
        break;
      case "rtf":
        text = rtfText(bytes);
        break;
      case "doc":
      case "ppt":
      case "xls":
        text = binaryOfficeText(bytes);
        break;
      default:
        return null;
    }
    if (!text) return null;
    const tidy = text
      .split("\n")
      .map((l) => l.replace(/[ \t ]+/g, " ").trim())
      .filter(Boolean)
      .join("\n")
      .slice(0, MAX_TEXT);
    return tidy || null;
  } catch {
    return null;
  }
}
