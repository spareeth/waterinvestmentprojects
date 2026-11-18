// Checks for an uploaded teaser. Pure and safe for the browser too (the forms show the limit). The browser's file
// type and name are not trusted: the bytes must match the format.
// - Workspace (M5, PLAN v0.2 F3): PDF only.
// - Upload link (M0, PLAN v0.3 F0): PDF or PowerPoint (.pptx); PowerPoint is converted to PDF later or by an admin.

/** 25 MB, counted in binary megabytes (what operating systems show as "25 MB"). */
export const MAX_TEASER_BYTES = 25 * 1024 * 1024;
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04"

export type TeaserFileType = "pdf" | "pptx";

export const TEASER_CONTENT_TYPE: Record<TeaserFileType, string> = {
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export type TeaserFileProblem =
  "file_missing" | "file_too_large" | "file_not_pdf" | "file_wrong_type";

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

/**
 * A PowerPoint (Office Open XML) file is a ZIP archive whose entry names are stored as plain text: it must start
 * with a ZIP header and name both "[Content_Types].xml" and "ppt/presentation.xml". Macro-enabled files (.pptm)
 * are refused by their file name.
 */
function looksLikePptx(bytes: Uint8Array): boolean {
  return (
    startsWithAt(bytes, ZIP_MAGIC, 0) &&
    containsAscii(bytes, "[Content_Types].xml") &&
    containsAscii(bytes, "ppt/presentation.xml")
  );
}

/** The format the name and the bytes agree on, or null. */
export function detectTeaserType(file: {
  name: string;
  bytes: Uint8Array;
}): TeaserFileType | null {
  const name = file.name.trim();
  if (/\.pdf$/i.test(name) && hasPdfHeader(file.bytes)) return "pdf";
  if (/\.pptx$/i.test(name) && looksLikePptx(file.bytes)) return "pptx";
  return null;
}

/** Workspace uploads: PDF only. */
export function teaserFileProblem(file: {
  name: string;
  bytes: Uint8Array;
}): Exclude<TeaserFileProblem, "file_wrong_type"> | null {
  if (file.bytes.byteLength === 0) return "file_missing";
  if (file.bytes.byteLength > MAX_TEASER_BYTES) return "file_too_large";
  if (detectTeaserType(file) !== "pdf") return "file_not_pdf";
  return null;
}

/** Upload link files: PDF or PowerPoint (.pptx). */
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
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f"<>|*?:]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  const stem = cleaned
    .replace(new RegExp(`\\.${type}$`, "i"), "")
    .slice(0, 200 - type.length - 1)
    .trim();
  return `${stem || "teaser"}.${type}`;
}

/** The file type from a stored (cleaned) file name; anything not .pptx is served as PDF. */
export function teaserTypeOf(filename: string): TeaserFileType {
  return /\.pptx$/i.test(filename) ? "pptx" : "pdf";
}

/** A readable size, for example "2.4 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
}
