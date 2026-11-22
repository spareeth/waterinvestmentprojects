// Checks for an uploaded teaser. Pure and safe for the browser too (the forms show the limit). The browser's file
// type and name are not trusted: the extension and the bytes must both name the same format.
// - Workspace (M5): PDF only. This is also how an admin attaches the converted PDF of a non-PDF upload.
// - Upload link (M11, PLAN v0.4 0b.4): PDF preferred; PowerPoint, Word, Excel, OpenDocument, RTF and JPG/PNG images
//   are also accepted, because countries will send the wrong format and admins convert. Executables, scripts,
//   archives, HTML and macro-enabled Office or OpenDocument files are refused. Investors only ever see a PDF: a
//   project whose current teaser is not a PDF cannot be published.

/** 25 MB, counted in binary megabytes (what operating systems show as "25 MB"). */
export const MAX_TEASER_BYTES = 25 * 1024 * 1024;

export const TEASER_FILE_TYPES = [
  "pdf",
  "ppt",
  "pptx",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "odt",
  "odp",
  "ods",
  "rtf",
  "jpg",
  "png",
] as const;

export type TeaserFileType = (typeof TEASER_FILE_TYPES)[number];

export const TEASER_CONTENT_TYPE: Record<TeaserFileType, string> = {
  pdf: "application/pdf",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  odt: "application/vnd.oasis.opendocument.text",
  odp: "application/vnd.oasis.opendocument.presentation",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  rtf: "application/rtf",
  jpg: "image/jpeg",
  png: "image/png",
};

/** Plain names for messages and badges. */
export const TEASER_TYPE_LABEL: Record<TeaserFileType, string> = {
  pdf: "PDF",
  ppt: "PowerPoint",
  pptx: "PowerPoint",
  doc: "Word",
  docx: "Word",
  xls: "Excel",
  xlsx: "Excel",
  odt: "OpenDocument text",
  odp: "OpenDocument presentation",
  ods: "OpenDocument spreadsheet",
  rtf: "RTF",
  jpg: "JPG image",
  png: "PNG image",
};

/** File name extensions per type (the first one is used for stored names). */
const EXTENSIONS: Record<TeaserFileType, readonly string[]> = {
  pdf: ["pdf"],
  ppt: ["ppt"],
  pptx: ["pptx"],
  doc: ["doc"],
  docx: ["docx"],
  xls: ["xls"],
  xlsx: ["xlsx"],
  odt: ["odt"],
  odp: ["odp"],
  ods: ["ods"],
  rtf: ["rtf"],
  jpg: ["jpg", "jpeg"],
  png: ["png"],
};

/** For the file input's accept attribute on the upload link form. */
export const SUBMISSION_ACCEPT = TEASER_FILE_TYPES.flatMap((t) =>
  EXTENSIONS[t].map((e) => `.${e}`),
).join(",");

export type TeaserFileProblem =
  "file_missing" | "file_too_large" | "file_not_pdf" | "file_wrong_type";

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04"
const OLE2_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]; // legacy Office (.doc, .xls, .ppt)
const RTF_MAGIC = [0x7b, 0x5c, 0x72, 0x74, 0x66]; // "{\rtf"
const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWithAt(bytes: Uint8Array, magic: number[], at: number) {
  return magic.every((b, j) => bytes[at + j] === b);
}

function hasPdfHeader(bytes: Uint8Array): boolean {
  // The header may follow a little junk; the PDF specification lets readers look within the first 1024 bytes.
  const limit = Math.min(bytes.byteLength, 1024) - PDF_MAGIC.length;
  for (let i = 0; i <= limit; i++) {
    if (startsWithAt(bytes, PDF_MAGIC, i)) return true;
  }
  return false;
}

function asciiAt(bytes: Uint8Array, text: string, at: number): boolean {
  return startsWithAt(
    bytes,
    Array.from(text, (c) => c.charCodeAt(0)),
    at,
  );
}

function containsAscii(bytes: Uint8Array, text: string): boolean {
  const needle = Array.from(text, (c) => c.charCodeAt(0));
  const last = bytes.byteLength - needle.length;
  outer: for (let i = 0; i <= last; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (bytes[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

/** Office Open XML part that identifies each format (entry names are stored as plain text in the ZIP). */
const OOXML_PART: Partial<Record<TeaserFileType, string>> = {
  pptx: "ppt/presentation.xml",
  docx: "word/document.xml",
  xlsx: "xl/workbook.xml",
};

/**
 * An Office Open XML file: a ZIP archive naming "[Content_Types].xml" and the format's main part. Macro-enabled
 * files (a VBA project, or a macroEnabled content type) are refused even when renamed to .docx/.xlsx/.pptx.
 */
function looksLikeOoxml(bytes: Uint8Array, part: string): boolean {
  return (
    startsWithAt(bytes, ZIP_MAGIC, 0) &&
    containsAscii(bytes, "[Content_Types].xml") &&
    containsAscii(bytes, part) &&
    !containsAscii(bytes, "vbaProject.bin") &&
    !containsAscii(bytes, "macroEnabled")
  );
}

const ODF_KIND: Partial<Record<TeaserFileType, string>> = {
  odt: "text",
  odp: "presentation",
  ods: "spreadsheet",
};

/**
 * An OpenDocument file: a ZIP whose first entry is the uncompressed "mimetype" file (name at offset 30, content
 * right after it), naming the exact kind. Templates and other kinds are refused, and so are documents with
 * Basic macros.
 */
function looksLikeOdf(bytes: Uint8Array, kind: string): boolean {
  const mimetype = `application/vnd.oasis.opendocument.${kind}`;
  return (
    startsWithAt(bytes, ZIP_MAGIC, 0) &&
    asciiAt(bytes, "mimetype", 30) &&
    asciiAt(bytes, mimetype, 38) &&
    bytes[38 + mimetype.length] !== 0x2d && // "-template" and similar
    !containsAscii(bytes, "Basic/")
  );
}

function contentMatches(type: TeaserFileType, bytes: Uint8Array): boolean {
  switch (type) {
    case "pdf":
      return hasPdfHeader(bytes);
    case "ppt":
    case "doc":
    case "xls":
      return startsWithAt(bytes, OLE2_MAGIC, 0);
    case "pptx":
    case "docx":
    case "xlsx":
      return looksLikeOoxml(bytes, OOXML_PART[type]!);
    case "odt":
    case "odp":
    case "ods":
      return looksLikeOdf(bytes, ODF_KIND[type]!);
    case "rtf":
      return startsWithAt(bytes, RTF_MAGIC, 0);
    case "jpg":
      return startsWithAt(bytes, JPEG_MAGIC, 0);
    case "png":
      return startsWithAt(bytes, PNG_MAGIC, 0);
  }
}

/** The type a file name's extension claims, or null for anything not accepted. */
export function typeFromExtension(name: string): TeaserFileType | null {
  const ext = /\.([A-Za-z0-9]+)$/.exec(name.trim())?.[1]?.toLowerCase();
  if (!ext) return null;
  return TEASER_FILE_TYPES.find((t) => EXTENSIONS[t].includes(ext)) ?? null;
}

/** The format the name and the bytes agree on, or null. */
export function detectTeaserType(file: {
  name: string;
  bytes: Uint8Array;
}): TeaserFileType | null {
  const type = typeFromExtension(file.name);
  return type && contentMatches(type, file.bytes) ? type : null;
}

/** Workspace uploads: PDF only. */
/**
 * Every upload route (the upload link, My projects and the Summit team's teaser upload) accepts the same formats
 * (user decision, 22 Nov). Kept as its own name for the workspace upload; it is the same check.
 */
export function teaserFileProblem(file: {
  name: string;
  bytes: Uint8Array;
}): Exclude<TeaserFileProblem, "file_not_pdf"> | null {
  return submissionFileProblem(file);
}

/** Any accepted document or image format (the upload link, My projects and the Summit team's upload). */
export function submissionFileProblem(file: {
  name: string;
  bytes: Uint8Array;
}): Exclude<TeaserFileProblem, "file_not_pdf"> | null {
  if (file.bytes.byteLength === 0) return "file_missing";
  if (file.bytes.byteLength > MAX_TEASER_BYTES) return "file_too_large";
  if (detectTeaserType(file) === null) return "file_wrong_type";
  return null;
}

/**
 * The original file name, kept for display and as the download name only (never as a storage key):
 * no folders, no control or quote characters, at most 200 characters, always ending in the type's extension.
 */
export function cleanFilename(
  name: string,
  type: TeaserFileType = "pdf",
): string {
  const ext = EXTENSIONS[type][0];
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f"<>|*?:]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  const stem = cleaned
    .replace(new RegExp(`\\.(${EXTENSIONS[type].join("|")})$`, "i"), "")
    .slice(0, 200 - ext.length - 1)
    .trim();
  return `${stem || "teaser"}.${ext}`;
}

/** The file type from a stored (cleaned) file name; a name without an accepted extension counts as PDF. */
export function teaserTypeOf(filename: string): TeaserFileType {
  return typeFromExtension(filename) ?? "pdf";
}

/** True when a stored teaser is a PDF, the only format investors see and the only one that can be published. */
export function isPdfFilename(filename: string): boolean {
  return /\.pdf$/i.test(filename.trim());
}

/** A readable size, for example "2.4 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
}
