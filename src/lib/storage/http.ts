// Response headers for serving a stored file. Pure.

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

/** Headers for a private PDF: never cached by shared caches, never sniffed as another type. */
export function privateFileHeaders(
  mode: ServeMode,
  filename: string,
  sizeBytes: number,
): Record<string, string> {
  return {
    "Content-Type": "application/pdf",
    "Content-Length": String(sizeBytes),
    "Content-Disposition": contentDisposition(mode, filename),
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
}
