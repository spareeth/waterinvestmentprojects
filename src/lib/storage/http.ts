// Response headers for serving a stored file. Pure.

import { TEASER_CONTENT_TYPE, teaserTypeOf } from "@/lib/workspace/teaser-file";

export type ServeMode = "view" | "download";

/**
 * Content-Disposition with a plain ASCII fallback name and the UTF-8 original (RFC 6266 / 5987), so names with
 * accents survive and quotes or line breaks can never break the header.
 */
export function contentDisposition(mode: ServeMode, filename: string): string {
  const type = mode === "download" ? "attachment" : "inline";
  const ascii =
    filename
      .normalize("NFKD")
      .replace(/[^\x20-\x7e]/g, "")
      .replace(/["\\;]/g, "")
      .trim() || "document.pdf";
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/**
 * Headers for a private file (PDF, or another accepted format from the upload link): never cached by shared caches,
 * never sniffed as another type. Only a PDF may be shown in the page; every other format (Office, OpenDocument,
 * RTF and images too) is always sent as a download, so nothing uploaded renders inline in the portal's origin.
 */
export function privateFileHeaders(
  mode: ServeMode,
  filename: string,
  sizeBytes: number,
): Record<string, string> {
  const type = teaserTypeOf(filename);
  return {
    "Content-Type": TEASER_CONTENT_TYPE[type],
    "Content-Length": String(sizeBytes),
    "Content-Disposition": contentDisposition(
      type === "pdf" ? mode : "download",
      filename,
    ),
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
}
