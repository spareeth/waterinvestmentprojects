// Checks for an uploaded teaser (PLAN F3: PDF only, max 25 MB; PowerPoint conversion comes after the demo).
// Pure and safe for the browser too (the form shows the limit). The browser's file type and name are not
// trusted: the bytes must contain the PDF header near the start.

/** 25 MB, counted in binary megabytes (what operating systems show as "25 MB"). */
export const MAX_TEASER_BYTES = 25 * 1024 * 1024;
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

export type TeaserFileProblem =
  "file_missing" | "file_too_large" | "file_not_pdf";

function hasPdfHeader(bytes: Uint8Array): boolean {
  // The header may follow a little junk; the PDF specification lets readers look within the first 1024 bytes.
  const limit = Math.min(bytes.byteLength, 1024) - PDF_MAGIC.length;
  for (let i = 0; i <= limit; i++) {
    if (PDF_MAGIC.every((b, j) => bytes[i + j] === b)) return true;
  }
  return false;
}

export function teaserFileProblem(file: {
  name: string;
  bytes: Uint8Array;
}): TeaserFileProblem | null {
  if (file.bytes.byteLength === 0) return "file_missing";
  if (file.bytes.byteLength > MAX_TEASER_BYTES) return "file_too_large";
  if (!/\.pdf$/i.test(file.name.trim())) return "file_not_pdf";
  if (!hasPdfHeader(file.bytes)) return "file_not_pdf";
  return null;
}

/**
 * The original file name, kept for display and as the download name only (never as a storage key):
 * no folders, no control or quote characters, at most 200 characters, always ending in .pdf.
 */
export function cleanFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f"<>|*?:]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  const stem = cleaned
    .replace(/\.pdf$/i, "")
    .slice(0, 196)
    .trim();
  return `${stem || "teaser"}.pdf`;
}

/** A readable size, for example "2.4 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
