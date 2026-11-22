import "server-only";
import { documentText } from "./doc-text";
import { type TeaserFacts, readTeaserFacts } from "./facts";

// Text of an uploaded teaser, for readTeaserFacts (22 Nov): every accepted format except images. PDFs go through
// pdf.js (unpdf, no native code, no eval); office and RTF files through doc-text.ts. Files are read in this
// process before the virus scan, so it is kept short: PDFs to the first two pages with a time limit, office
// files with size caps, and any failure (a scanned image, a broken or hostile file) simply gives no text.
// Reading never fails or noticeably delays an upload.

const TIME_LIMIT_MS = 8000;
const MAX_PAGES = 2;

export async function pdfText(bytes: Uint8Array): Promise<string | null> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    // pdf.js may take the buffer over: give it a copy.
    const work = (async () => {
      // No eval for font programs (pdf.js option; unpdf's types do not list it).
      const options = { isEvalSupported: false, disableFontFace: true };
      const pdf = await getDocumentProxy(
        new Uint8Array(bytes),
        options as Parameters<typeof getDocumentProxy>[1],
      );
      try {
        const { text } = await extractText(pdf, { mergePages: false });
        return text.slice(0, MAX_PAGES).join("\n");
      } finally {
        const closable = pdf as unknown as { destroy?: () => Promise<void> };
        await closable.destroy?.().catch(() => undefined);
      }
    })();
    const timeout = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), TIME_LIMIT_MS).unref?.(),
    );
    const text = await Promise.race([work, timeout]);
    work.catch(() => undefined);
    return text && text.trim() ? text : null;
  } catch {
    return null;
  }
}

/** The text of a teaser of any accepted type, or null (images, unreadable files). */
export async function teaserText(
  bytes: Uint8Array,
  type: string | null,
): Promise<string | null> {
  if (!type || type === "jpg" || type === "png") return null;
  return type === "pdf" ? pdfText(bytes) : documentText(bytes, type);
}

/** The key facts of a teaser; empty for an image or when nothing can be read. */
export async function teaserFactsFromFile(
  bytes: Uint8Array,
  type: string | null,
  countryNames: readonly string[] = [],
): Promise<TeaserFacts> {
  const text = await teaserText(bytes, type);
  return text ? readTeaserFacts(text, { countryNames }) : {};
}
