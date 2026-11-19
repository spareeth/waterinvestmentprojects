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

describe("teaser files", () => {
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
      }),
    ).toEqual({
      ok: true,
      data: { uploaderName: "Ada Lovelace", uploaderEmail: "ada@ministry.gov" },
    });
    const bad = parseUploader({
      uploaderName: "A\nB",
      uploaderEmail: "nope",
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(Object.keys(bad.fieldErrors).sort()).toEqual([
        "uploaderEmail",
        "uploaderName",
      ]);
    }
  });

  it("offers a fixed sector list", () => {
    expect(SUBMISSION_SECTORS).toContain("Other");
    expect(isSubmissionSector("Desalination")).toBe(true);
    expect(isSubmissionSector("desalination")).toBe(false);
  });

  it("makes a working project name from the file name", () => {
    expect(projectNameFromFilename("Lake_Basin-PPP  teaser.pdf")).toBe(
      "Lake Basin PPP teaser",
    );
    expect(projectNameFromFilename("x.pptx")).toBe("Project teaser");
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
  it("uses the exact WBG acknowledgement wording with a version", () => {
    expect(appConfig.uploadAcknowledgement.text).toBe(
      "I confirm, on behalf of the represented Government, consent for the uploaded project teaser to be shared with the participants invited to the Water Investment Summit, through the Water Investment Summit Project Portal.",
    );
    expect(appConfig.uploadAcknowledgement.version).toMatch(/v\d+$/);
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
