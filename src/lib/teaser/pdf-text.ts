import "server-only";
import { type TeaserFacts, readTeaserFacts } from "./facts";

// Text of an uploaded PDF teaser, for readTeaserFacts (22 Nov). pdf.js (through unpdf, no native code) reads the
// file in this process, before the virus scan, so it is kept short: only PDFs, the first two pages, a time
// limit, and any failure (a scanned image, a broken or hostile file) simply gives no text. Reading never fails
// or delays an upload by more than the time limit.

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

/** The key facts of a PDF teaser; empty for any other file or when nothing can be read. */
export async function teaserFactsFromFile(
  bytes: Uint8Array,
  type: string | null,
  countryNames: readonly string[] = [],
): Promise<TeaserFacts> {
  if (type !== "pdf") return {};
  const text = await pdfText(bytes);
  return text ? readTeaserFacts(text, { countryNames }) : {};
}
