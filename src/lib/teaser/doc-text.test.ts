import { crc32, deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { createZip } from "@/lib/admin/zip";
import { documentText } from "./doc-text";
import { readTeaserFacts } from "./facts";

// Fictional teasers in the WBG layout, in each office format (22 Nov: read the details from every format but images).

const LINES = [
  "FICTIONLAND — HARBOUR REUSE SCHEME",
  "WASTEWATER AND REUSE · Port Example",
  "PPP MODEL",
  "DBFOM",
  "TOTAL PROJECT SIZE",
  "USD 80 million",
  "DEVELOPMENT STAGE",
  "Due diligence",
];
const EXPECTED = {
  title: "Harbour Reuse Scheme",
  sector: "Wastewater and reuse",
  region: "Port Example",
  pppModel: "DBFOM",
  sizeMinUsdMillion: 80,
  sizeMaxUsdMillion: 80,
  developmentStage: "Due diligence",
};
const facts = (text: string | null) =>
  readTeaserFacts(text ?? "", { countryNames: ["Fictionland"] });

const enc = (s: string) => new TextEncoder().encode(s);
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A ZIP whose parts are deflated, like Office saves them (createZip only stores). */
function deflatedZip(
  entries: { name: string; data: Uint8Array }[],
): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc(e.name);
    const data = new Uint8Array(deflateRawSync(e.data));
    const crc = crc32(e.data);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(8, 8, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, e.data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    const cd = new Uint8Array(46 + name.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, 8, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, e.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    cd.set(name, 46);
    chunks.push(local, data);
    central.push(cd);
    offset += local.length + data.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const all = [...chunks, ...central, end];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of all) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

describe("documentText", () => {
  it("reads a Word file (deflated, text in runs and a text box)", () => {
    const body = LINES.map(
      (l, i) =>
        `<w:p><w:r><w:t>${esc(l.slice(0, 4))}</w:t></w:r><w:r><w:t xml:space="preserve">${esc(l.slice(4))}</w:t></w:r></w:p>${i === 1 ? "<w:p><w:r><w:tab/></w:r></w:p>" : ""}`,
    ).join("");
    const docx = deflatedZip([
      { name: "[Content_Types].xml", data: enc("<Types/>") },
      {
        name: "word/document.xml",
        data: enc(`<w:document><w:body>${body}</w:body></w:document>`),
      },
    ]);
    expect(facts(documentText(docx, "docx"))).toEqual(EXPECTED);
  });

  it("reads the first slides of a PowerPoint file in slide order", () => {
    const slide = (lines: string[]) =>
      enc(
        `<p:sld><p:txBody>${lines.map((l) => `<a:p><a:r><a:t>${esc(l)}</a:t></a:r></a:p>`).join("")}</p:txBody></p:sld>`,
      );
    const pptx = createZip([
      { name: "ppt/slides/slide10.xml", data: slide(["Annex, not read"]) },
      { name: "ppt/slides/slide2.xml", data: slide(LINES.slice(2)) },
      { name: "ppt/slides/slide1.xml", data: slide(LINES.slice(0, 2)) },
    ]);
    const text = documentText(pptx, "pptx");
    expect(text).not.toContain("Annex");
    expect(facts(text)).toEqual(EXPECTED);
  });

  it("reads an Excel sheet cell by cell, with shared strings", () => {
    const sst = `<sst>${LINES.map((l) => `<si><t>${esc(l)}</t></si>`).join("")}</sst>`;
    const cells = LINES.map(
      (_, i) => `<row><c r="A${i + 1}" t="s"><v>${i}</v></c></row>`,
    ).join("");
    const xlsx = deflatedZip([
      { name: "xl/sharedStrings.xml", data: enc(sst) },
      {
        name: "xl/worksheets/sheet1.xml",
        data: enc(`<worksheet><sheetData>${cells}</sheetData></worksheet>`),
      },
    ]);
    expect(facts(documentText(xlsx, "xlsx"))).toEqual(EXPECTED);
  });

  it("reads OpenDocument text", () => {
    const odt = createZip([
      {
        name: "content.xml",
        data: enc(
          `<office:text>${LINES.map((l) => `<text:p>${esc(l)}</text:p>`).join("")}</office:text>`,
        ),
      },
    ]);
    expect(facts(documentText(odt, "odt"))).toEqual(EXPECTED);
  });

  it("reads RTF, leaving out font tables and decoding escapes", () => {
    const rtf = enc(
      `{\\rtf1\\ansi{\\fonttbl{\\f0 Arial;}}{\\colortbl;\\red0\\green0\\blue0;}\\f0 ${LINES.map(
        (l) => l.replace("—", "\\u8212?").replace("·", "\\'b7"),
      ).join("\\par ")}}`,
    );
    expect(facts(documentText(rtf, "rtf"))).toEqual(EXPECTED);
  });

  it("reads the text runs of an old binary Word file", () => {
    const utf16 = (s: string) => {
      const out = new Uint8Array(s.length * 2);
      for (let i = 0; i < s.length; i++) {
        out[i * 2] = s.charCodeAt(i) & 0xff;
        out[i * 2 + 1] = s.charCodeAt(i) >> 8;
      }
      return out;
    };
    const header = new Uint8Array([
      0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0,
    ]);
    const text = utf16(LINES.join("\r"));
    const doc = new Uint8Array(header.length + text.length + 4);
    doc.set(header);
    doc.set(text, header.length);
    expect(facts(documentText(doc, "doc"))).toEqual(EXPECTED);
  });

  it("gives no text for images, unknown types and broken files", () => {
    expect(documentText(enc("not a zip"), "docx")).toBeNull();
    expect(documentText(new Uint8Array([0xff, 0xd8, 0xff]), "jpg")).toBeNull();
    expect(documentText(enc("anything"), "exe")).toBeNull();
  });
});
