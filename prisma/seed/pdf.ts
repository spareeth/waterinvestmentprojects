// Builds small, deterministic one-page placeholder PDFs for seed teasers.
// No dependencies; plain PDF 1.4 with the standard Helvetica fonts. ASCII text only.

export interface PlaceholderPdf {
  title: string;
  subtitle?: string;
  lines: string[];
}

const PAGE_WIDTH = 595; // A4 in points
const PAGE_HEIGHT = 842;
const BANNER = "FICTIONAL DEMO DATA. NOT A REAL PROJECT.";

/** Keeps printable ASCII only and escapes the characters PDF strings treat specially. */
export function escapePdfText(text: string): string {
  return text
    .replace(/[^\x20-\x7e]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function textOp(
  font: "F1" | "F2",
  size: number,
  x: number,
  y: number,
  text: string,
): string {
  return `BT /${font} ${size} Tf ${x} ${y} Td (${escapePdfText(text)}) Tj ET`;
}

function contentStream(doc: PlaceholderPdf): string {
  const ops: string[] = [];
  // Header band.
  ops.push("0.04 0.23 0.40 rg", `0 ${PAGE_HEIGHT - 70} ${PAGE_WIDTH} 70 re f`);
  ops.push("1 1 1 rg", textOp("F2", 11, 40, PAGE_HEIGHT - 30, BANNER));
  ops.push(
    textOp(
      "F1",
      9,
      40,
      PAGE_HEIGHT - 50,
      "Project teaser placeholder for local and staging use",
    ),
  );
  // Title block.
  ops.push(
    "0.07 0.09 0.12 rg",
    textOp("F2", 20, 40, PAGE_HEIGHT - 115, doc.title),
  );
  let y = PAGE_HEIGHT - 140;
  if (doc.subtitle) {
    ops.push("0.35 0.38 0.42 rg", textOp("F1", 12, 40, y, doc.subtitle));
    y -= 30;
  }
  ops.push("0.07 0.09 0.12 rg");
  for (const line of doc.lines) {
    ops.push(textOp("F1", 11, 40, y, line));
    y -= 18;
  }
  // Footer.
  ops.push("0.55 0.58 0.62 rg", textOp("F1", 8, 40, 30, BANNER));
  return ops.join("\n");
}

/** Returns the bytes of a valid single-page PDF. Same input always gives the same bytes. */
export function buildPlaceholderPdf(doc: PlaceholderPdf): Uint8Array {
  const stream = contentStream(doc);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      "/Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(out.length);
    out += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    out += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  // Everything above is ASCII, so string length equals byte length.
  return new TextEncoder().encode(out);
}
