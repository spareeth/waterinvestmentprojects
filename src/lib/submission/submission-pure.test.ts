import { describe, expect, it } from "vitest";
import { CountryStatus } from "@/generated/prisma/enums";
import {
  canListSubmissions,
  canManageUploadLinks,
  NO_SUBMISSION,
  submissionCountryId,
  submissionWhere,
  uploadLinkState,
} from "@/lib/authz/submissions";
import {
  generateUploadToken,
  hashUploadToken,
  isWellFormedUploadToken,
} from "@/lib/authz/upload-token";
import type { Viewer } from "@/lib/authz/viewer";
import { appConfig } from "@/lib/config";
import { privateFileHeaders } from "@/lib/storage/http";
import { isSafeKey, submissionBlobKey } from "@/lib/storage/keys";
import {
  cleanFilename,
  detectTeaserType,
  MAX_TEASER_BYTES,
  submissionFileProblem,
  teaserFileProblem,
} from "@/lib/workspace/teaser-file";
import { FIELD_MESSAGES, SUBMISSION_MESSAGES } from "./errors";
import { summitSubmissionNotice, uploaderConfirmationEmail } from "./emails";
import { formatUaeTime } from "./format";
import {
  defaultLinkExpiryDate,
  isSubmissionSector,
  linkExpiryFromDate,
  parseUploader,
  projectNameFromFilename,
  SUBMISSION_SECTORS,
} from "./input";

const enc = (s: string) => new TextEncoder().encode(s);
const pdfBytes = enc("%PDF-1.7\n%%EOF\n");
const pptxBytes = enc(
  "PK\u0003\u0004....[Content_Types].xml....ppt/presentation.xml....",
);

function viewer(role: Viewer["role"]): Viewer {
  return {
    id: `u-${role}`,
    role,
    memberships: [],
  };
}

describe("upload link tokens", () => {
  it("are 43 URL-safe characters, unique, and stored only as a SHA-256", () => {
    const a = generateUploadToken();
    const b = generateUploadToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
    expect(hashUploadToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashUploadToken(a)).not.toContain(a);
    expect(isWellFormedUploadToken(a)).toBe(true);
    for (const bad of [
      "",
      "short",
      `${a}x`,
      "../".repeat(15),
      `${a.slice(1)}=`,
    ]) {
      expect(isWellFormedUploadToken(bad)).toBe(false);
    }
  });
});

describe("upload link state", () => {
  const now = new Date("2026-11-20T10:00:00Z");
  const active = { status: CountryStatus.ACTIVE };
  const link = {
    countryId: "c-a",
    expiresAt: new Date("2026-11-30T19:59:59Z"),
    revokedAt: null,
    country: active,
  };

  it("is valid until it expires, is revoked, or its country is switched off", () => {
    expect(uploadLinkState(link, now)).toBe("valid");
    expect(uploadLinkState(null, now)).toBe("not_found");
    expect(uploadLinkState({ ...link, revokedAt: now }, now)).toBe("revoked");
    expect(uploadLinkState({ ...link, expiresAt: now }, now)).toBe("expired");
    expect(
      uploadLinkState({ ...link, expiresAt: now, revokedAt: now }, now),
    ).toBe("revoked");
    expect(
      uploadLinkState(
        { ...link, country: { status: CountryStatus.INACTIVE } },
        now,
      ),
    ).toBe("revoked");
    expect(
      uploadLinkState({ ...link, countryId: null, country: null }, now),
    ).toBe("valid");
  });

  it("fixes the country on a country link and only takes it from the form on the generic link", () => {
    expect(submissionCountryId({ countryId: "c-a" }, "c-b")).toBe("c-a");
    expect(submissionCountryId({ countryId: "c-a" }, null)).toBe("c-a");
    expect(submissionCountryId({ countryId: null }, " c-b ")).toBe("c-b");
    expect(submissionCountryId({ countryId: null }, "")).toBeNull();
    expect(submissionCountryId({ countryId: null }, undefined)).toBeNull();
  });
});

describe("submission permissions", () => {
  it("are for Summit and platform admins only", () => {
    for (const role of ["PLATFORM_ADMIN", "SUMMIT_ADMIN"] as const) {
      expect(canManageUploadLinks(viewer(role))).toBe(true);
      expect(canListSubmissions(viewer(role))).toBe(true);
      expect(submissionWhere(viewer(role))).toEqual({});
    }
    for (const v of [viewer("COUNTRY"), viewer("INVESTOR"), null]) {
      expect(canManageUploadLinks(v)).toBe(false);
      expect(canListSubmissions(v)).toBe(false);
      expect(submissionWhere(v)).toEqual(NO_SUBMISSION);
    }
  });
});

/** A ZIP whose first entry is the stored "mimetype" file, as OpenDocument writes it. */
function odf(kind: string, extra = ""): Uint8Array {
  const header = new Uint8Array(30);
  header.set([0x50, 0x4b, 0x03, 0x04]);
  const rest = enc(
    `mimetypeapplication/vnd.oasis.opendocument.${kind}${extra}`,
  );
  const out = new Uint8Array(header.length + rest.length);
  out.set(header);
  out.set(rest, header.length);
  return out;
}
const ole2 = new Uint8Array([
  0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0,
]);
const ooxml = (part: string, extra = "") =>
  enc(`PK\u0003\u0004....[Content_Types].xml....${part}....${extra}`);

describe("teaser files", () => {
  it("accepts every format in PLAN v0.4 0b.4 when name and content agree (M11)", () => {
    const ok: [string, Uint8Array, string][] = [
      ["a.pdf", pdfBytes, "pdf"],
      ["a.ppt", ole2, "ppt"],
      ["a.doc", ole2, "doc"],
      ["a.XLS", ole2, "xls"],
      ["a.pptx", pptxBytes, "pptx"],
      ["a.docx", ooxml("word/document.xml"), "docx"],
      ["a.xlsx", ooxml("xl/workbook.xml"), "xlsx"],
      ["a.odt", odf("text"), "odt"],
      ["a.odp", odf("presentation"), "odp"],
      ["a.ods", odf("spreadsheet"), "ods"],
      ["a.rtf", enc("{\\rtf1\\ansi hello}"), "rtf"],
      ["a.jpg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0]), "jpg"],
      ["a.JPEG", new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0]), "jpg"],
      [
        "a.png",
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]),
        "png",
      ],
    ];
    for (const [name, bytes, type] of ok) {
      expect(detectTeaserType({ name, bytes }), name).toBe(type);
      expect(submissionFileProblem({ name, bytes }), name).toBeNull();
    }
  });

  it("refuses executables, scripts, archives, HTML, macros and disguised files (M11)", () => {
    const refused: [string, Uint8Array][] = [
      ["a.exe", enc("MZ\u0090\u0000")],
      ["a.pdf.exe", pdfBytes],
      ["a.js", enc("alert(1)")],
      ["a.html", enc("<!doctype html><script>")],
      ["a.svg", enc("<svg onload=alert(1)>")],
      ["a.zip", enc("PK\u0003\u0004 anything")],
      ["a.rar", enc("Rar!\u001a\u0007")],
      ["a.7z", new Uint8Array([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])],
      // A plain ZIP, HTML or executable renamed to an accepted extension.
      ["a.docx", enc("PK\u0003\u0004 just a zip")],
      ["a.pdf", enc("<html><body>teaser</body></html>")],
      ["a.doc", enc("MZ\u0090\u0000")],
      ["a.jpg", pdfBytes],
      ["a.png", new Uint8Array([0xff, 0xd8, 0xff])],
      ["a.rtf", enc("<html>{\\rtf")],
      ["a.xlsx", ooxml("word/document.xml")],
      // Macro-enabled files, even with a harmless-looking extension.
      ["a.docm", ooxml("word/document.xml")],
      ["a.docx", ooxml("word/document.xml", "word/vbaProject.bin")],
      [
        "a.xlsx",
        ooxml("xl/workbook.xml", "application/vnd.ms-excel.sheet.macroEnabled"),
      ],
      ["a.odt", odf("text", "....Basic/Standard/Module1.xml")],
      // OpenDocument of another kind or a template.
      ["a.odt", odf("presentation")],
      ["a.odt", odf("text-template")],
    ];
    for (const [name, bytes] of refused) {
      expect(detectTeaserType({ name, bytes }), name).toBeNull();
      expect(submissionFileProblem({ name, bytes }), name).toBe(
        "file_wrong_type",
      );
    }
  });

  it("accepts PDF and PowerPoint by content and name together", () => {
    expect(detectTeaserType({ name: "a.pdf", bytes: pdfBytes })).toBe("pdf");
    expect(detectTeaserType({ name: "A.PPTX", bytes: pptxBytes })).toBe("pptx");
    // Name and content must agree.
    expect(detectTeaserType({ name: "a.pptx", bytes: pdfBytes })).toBeNull();
    expect(detectTeaserType({ name: "a.pdf", bytes: pptxBytes })).toBeNull();
    // A Word file or other ZIP renamed to .pptx, and macro-enabled decks, are refused.
    expect(
      detectTeaserType({
        name: "a.pptx",
        bytes: enc("PK\u0003\u0004 [Content_Types].xml word/document.xml"),
      }),
    ).toBeNull();
    expect(detectTeaserType({ name: "a.pptm", bytes: pptxBytes })).toBeNull();
    expect(detectTeaserType({ name: "a.exe", bytes: enc("MZ") })).toBeNull();
  });

  it("checks size and type for the upload link, and keeps the workspace PDF only", () => {
    expect(submissionFileProblem({ name: "a.pptx", bytes: pptxBytes })).toBe(
      null,
    );
    expect(
      submissionFileProblem({ name: "a.pdf", bytes: new Uint8Array() }),
    ).toBe("file_missing");
    const big = new Uint8Array(MAX_TEASER_BYTES + 1);
    big.set(pdfBytes);
    expect(submissionFileProblem({ name: "a.pdf", bytes: big })).toBe(
      "file_too_large",
    );
    expect(submissionFileProblem({ name: "a.doc", bytes: pdfBytes })).toBe(
      "file_wrong_type",
    );
    expect(teaserFileProblem({ name: "a.pptx", bytes: pptxBytes })).toBe(
      "file_not_pdf",
    );
  });

  it("cleans names and keeps the right extension, within 200 characters", () => {
    expect(cleanFilename('C:\\x\\"Deck".pptx', "pptx")).toBe("Deck.pptx");
    expect(cleanFilename("deck", "pptx")).toBe("deck.pptx");
    expect(cleanFilename("a".repeat(300) + ".pptx", "pptx")).toHaveLength(200);
    expect(cleanFilename("a".repeat(300) + ".pdf")).toHaveLength(200);
    expect(cleanFilename("Scan.JPEG", "jpg")).toBe("Scan.jpg");
    expect(cleanFilename("Budget.xlsx", "xlsx")).toBe("Budget.xlsx");
  });

  it("serves every format other than PDF as a download only", () => {
    for (const name of [
      "a.docx",
      "a.xls",
      "a.odp",
      "a.rtf",
      "a.png",
      "a.jpg",
    ]) {
      expect(
        privateFileHeaders("view", name, 10)["Content-Disposition"],
        name,
      ).toMatch(/^attachment;/);
    }
    expect(privateFileHeaders("view", "a.png", 10)["Content-Type"]).toBe(
      "image/png",
    );
    expect(() => submissionBlobKey("a", "b", "../pdf")).toThrow();
  });

  it("are stored under safe keys and served with the right type", () => {
    const key = submissionBlobKey(
      "0b8a3c1e-1111-4222-8333-944455556666",
      "1c9b4d2f-1111-4222-8333-944455556666",
      "pptx",
    );
    expect(isSafeKey(key)).toBe(true);
    expect(() => submissionBlobKey("../x", "y", "pdf")).toThrow();
    const pptxHeaders = privateFileHeaders("view", "Deck.pptx", 10);
    expect(pptxHeaders["Content-Type"]).toContain("presentationml");
    expect(pptxHeaders["Content-Disposition"]).toMatch(/^attachment;/);
    const pdfHeaders = privateFileHeaders("view", "Teaser.pdf", 10);
    expect(pdfHeaders["Content-Type"]).toBe("application/pdf");
    expect(pdfHeaders["Content-Disposition"]).toMatch(/^inline;/);
  });
});

describe("upload form input", () => {
  it("trims and lower-cases the email and refuses line breaks in the name", () => {
    expect(
      parseUploader({
        uploaderName: "  Ada   Lovelace ",
        uploaderEmail: " Ada@Ministry.GOV ",
        uploaderJobTitle: "  Director of   Planning ",
      }),
    ).toEqual({
      ok: true,
      data: {
        uploaderName: "Ada Lovelace",
        uploaderEmail: "ada@ministry.gov",
        uploaderJobTitle: "Director of Planning",
      },
    });
    const bad = parseUploader({
      uploaderName: "A\nB",
      uploaderEmail: "nope",
      uploaderJobTitle: "Lead\nEngineer",
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(Object.keys(bad.fieldErrors).sort()).toEqual([
        "uploaderEmail",
        "uploaderJobTitle",
        "uploaderName",
      ]);
    }
  });

  it("requires a job title (M11)", () => {
    const missing = parseUploader({
      uploaderName: "Ada Lovelace",
      uploaderEmail: "ada@ministry.gov",
      uploaderJobTitle: "  ",
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.fieldErrors.uploaderJobTitle).toBe(
        "Enter your job title.",
      );
    }
  });

  it("offers the WBG sector list, ending in Other (M11)", () => {
    expect(SUBMISSION_SECTORS).toEqual([
      "Water supply",
      "Water treatment",
      "Wastewater treatment",
      "Wastewater and reuse",
      "Water supply and wastewater",
      "Desalination",
      "Sludge",
      "Non-revenue water (NRW)",
      "Irrigation infrastructure",
      "Other",
    ]);
    expect(isSubmissionSector("Desalination")).toBe(true);
    expect(isSubmissionSector("desalination")).toBe(false);
    expect(isSubmissionSector("Network efficiency")).toBe(false);
  });

  it("makes a working project name from the file name", () => {
    expect(projectNameFromFilename("Lake_Basin-PPP  teaser.pdf")).toBe(
      "Lake Basin PPP teaser",
    );
    expect(projectNameFromFilename("x.pptx")).toBe("Project teaser");
    expect(projectNameFromFilename("Coastal reuse plan.DOCX")).toBe(
      "Coastal reuse plan",
    );
    expect(projectNameFromFilename("Scan of teaser.jpeg")).toBe(
      "Scan of teaser",
    );
  });

  it("reads expiry dates as the end of the day in UAE time", () => {
    expect(linkExpiryFromDate("2026-11-30").toISOString()).toBe(
      "2026-11-30T19:59:59.000Z",
    );
    expect(Number.isNaN(linkExpiryFromDate("30/11/2026").getTime())).toBe(true);
    expect(defaultLinkExpiryDate(new Date("2026-11-18T10:00:00Z"))).toBe(
      "2026-11-30",
    );
    expect(defaultLinkExpiryDate(new Date("2026-12-05T10:00:00Z"))).toBe(
      "2026-12-12",
    );
  });
});

describe("texts", () => {
  it("uses the v2 acknowledgement working text with its version (PLAN v0.4 0b.3)", () => {
    expect(appConfig.uploadAcknowledgement.text).toBe(
      "I confirm, on behalf of the government organisation I represent, consent for the uploaded project teaser(s) to be shared with the participants invited to the Water Investment Summit, through the Water Investment Projects portal.",
    );
    expect(appConfig.uploadAcknowledgement.version).toBe(
      "country-upload-ack-v2",
    );
    expect(appConfig.uploadAcknowledgementOnBehalf.version).toBe(
      "country-upload-ack-v2-on-behalf",
    );
  });

  it("shows times in UAE time", () => {
    expect(formatUaeTime(new Date("2026-11-19T08:30:00Z"))).toBe(
      "19 November 2026 at 12:30 (UAE time)",
    );
  });

  const facts = {
    submissionId: "sub-1",
    countryName: "Country A",
    uploaderName: "Ada",
    uploaderEmail: "ada@ministry.example",
    acceptedAt: new Date("2026-11-19T08:30:00Z"),
    ackText: appConfig.uploadAcknowledgement.text,
    files: [{ filename: "Teaser.pdf", sector: "Desalination" }],
  };

  it("writes the uploader confirmation and the Summit notice", () => {
    const confirmation = uploaderConfirmationEmail(facts);
    expect(confirmation.subject).toBe(
      `${appConfig.name}: we received your 1 teaser (Country A)`,
    );
    expect(confirmation.text).toContain("Teaser.pdf (sector: Desalination)");
    expect(confirmation.text).toContain(facts.ackText);
    expect(confirmation.text).toContain("19 November 2026 at 12:30 (UAE time)");
    expect(confirmation.text).toContain("Reference: sub-1");
    const notice = summitSubmissionNotice(facts);
    expect(notice.subject).toBe("New teaser submission: Country A (1 file)");
    expect(notice.text).toContain("Ada <ada@ministry.example>");
    expect(notice.text).toMatch(/\/admin\/submissions$/m);
    expect(notice.text).not.toContain("not a PDF");
  });

  it("shows the job title and flags files that are not a PDF to the Summit team (M11)", () => {
    const more = {
      ...facts,
      uploaderJobTitle: "Head of PPP Unit",
      files: [
        { filename: "Teaser.pdf", sector: "Desalination" },
        { filename: "Deck.pptx", sector: "Sludge" },
      ],
    };
    const confirmation = uploaderConfirmationEmail(more);
    const notice = summitSubmissionNotice(more);
    expect(confirmation.text).toContain("Job title: Head of PPP Unit");
    expect(notice.text).toContain("Job title: Head of PPP Unit");
    expect(notice.text).toMatch(/Deck\.pptx \(sector: Sludge\) \[not a PDF/);
    expect(notice.text).not.toMatch(/Teaser\.pdf .*not a PDF/);
    expect(confirmation.text).not.toContain("not a PDF");
  });

  it("writes messages without em dashes or tiers", () => {
    const confirmation = uploaderConfirmationEmail(facts);
    const notice = summitSubmissionNotice(facts);
    const all = [
      confirmation.subject,
      confirmation.text,
      notice.subject,
      notice.text,
      appConfig.uploadAcknowledgement.text,
      ...Object.values(SUBMISSION_MESSAGES),
      ...Object.values(FIELD_MESSAGES),
    ].join("\n");
    expect(all).not.toMatch(/\u2014/);
    expect(all).not.toMatch(/tier/i);
  });
});
