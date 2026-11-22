import { describe, expect, it } from "vitest";
import { ScanStatus } from "@/generated/prisma/enums";
import {
  UPLOAD_ACK_ON_BEHALF_TEXT_VERSION as SEED_ON_BEHALF_VERSION,
  UPLOAD_ACK_TEXT_VERSION as SEED_TEXT_VERSION,
} from "../../../prisma/seed/data";
import { appConfig } from "@/lib/config";
import { contentDisposition, privateFileHeaders } from "@/lib/storage/http";
import { isSafeKey, teaserBlobKey } from "@/lib/storage/keys";
import { initialScan } from "@/lib/storage/scan";
import { workspaceUploadAcknowledgement } from "./acknowledgement";
import { WORKSPACE_MESSAGES } from "./errors";
import {
  millionToUsd,
  PROJECT_FIELDS,
  parseProjectInput,
  usdToMillion,
} from "./project-input";
import {
  cleanFilename,
  formatBytes,
  MAX_TEASER_BYTES,
  teaserFileProblem,
} from "./teaser-file";

const pdf = (extra = "") =>
  new TextEncoder().encode(`%PDF-1.7\n${extra}\n%%EOF`);

describe("teaser file checks", () => {
  it("accepts a small PDF", () => {
    expect(teaserFileProblem({ name: "Teaser.PDF", bytes: pdf() })).toBeNull();
  });

  it("refuses an empty file", () => {
    expect(teaserFileProblem({ name: "a.pdf", bytes: new Uint8Array() })).toBe(
      "file_missing",
    );
  });

  it("refuses files over 25 MB, and accepts exactly 25 MB", () => {
    const big = new Uint8Array(MAX_TEASER_BYTES + 1);
    big.set(pdf());
    expect(teaserFileProblem({ name: "a.pdf", bytes: big })).toBe(
      "file_too_large",
    );
    const exact = big.subarray(0, MAX_TEASER_BYTES);
    expect(teaserFileProblem({ name: "a.pdf", bytes: exact })).toBeNull();
  });

  it("accepts the same formats as the upload link, and refuses a file whose content does not match its name (22 Nov)", () => {
    const pptx = new TextEncoder().encode(
      "PK\u0003\u0004 [Content_Types].xml ppt/presentation.xml",
    );
    expect(teaserFileProblem({ name: "deck.pptx", bytes: pptx })).toBeNull();
    expect(teaserFileProblem({ name: "deck.pptx", bytes: pdf() })).toBe(
      "file_wrong_type",
    );
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
    expect(teaserFileProblem({ name: "deck.pdf", bytes: zip })).toBe(
      "file_wrong_type",
    );
  });

  it("finds the PDF header after a little leading junk", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...pdf()]);
    expect(teaserFileProblem({ name: "a.pdf", bytes })).toBeNull();
  });

  it("cleans file names for display and download", () => {
    expect(cleanFilename("C:\\Users\\x\\My teaser.pdf")).toBe("My teaser.pdf");
    expect(cleanFilename('../../etc/"evil"\n.pdf')).toBe("evil.pdf");
    expect(cleanFilename("...")).toBe("teaser.pdf");
    expect(cleanFilename("a".repeat(300) + ".pdf")).toHaveLength(200);
  });

  it("formats sizes", () => {
    expect(formatBytes(512)).toBe("512 bytes");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(MAX_TEASER_BYTES)).toBe("25 MB");
    expect(formatBytes(2.5 * 1024 * 1024)).toBe("2.5 MB");
  });
});

describe("project input", () => {
  const valid = {
    title: "Coastal desalination plant",
    sector: "Desalination",
    projectType: "SUMMIT_PIPELINE",
    sizeMinUsdMillion: "120.5",
    sizeMaxUsdMillion: "200",
    developmentStage: "Feasibility",
  };

  it("parses a valid project, converting USD million to USD", () => {
    const result = parseProjectInput(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.title).toBe("Coastal desalination plant");
    expect(result.data.sizeMinUsd).toBe("120500000");
    expect(result.data.sizeMaxUsd).toBe("200000000");
    expect(result.data.pppModel).toBeNull();
    expect(result.data.developmentStage).toBe("Feasibility");
  });

  it("requires title, sector and type", () => {
    const result = parseProjectInput({});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.fieldErrors).sort()).toEqual([
      "projectType",
      "sector",
      "title",
    ]);
  });

  it("has no tier and none of the fields PLAN v0.3 removed", () => {
    for (const removed of [
      "tier",
      "name",
      "tenderTimeline",
      "documentsPrepared",
      "feedbackSought",
      "revenueModel",
      "counterparty",
      "lat",
      "lon",
    ]) {
      expect(PROJECT_FIELDS as readonly string[]).not.toContain(removed);
    }
    const result = parseProjectInput({ ...valid, tier: "TIER1" } as never);
    expect(result.ok && "tier" in result.data).toBe(false);
  });

  it("rejects an upper size below the lower size", () => {
    const result = parseProjectInput({
      ...valid,
      sizeMinUsdMillion: "300",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.sizeMaxUsdMillion).toBeTruthy();
  });

  it("stores an empty development stage as null", () => {
    const result = parseProjectInput({ ...valid, developmentStage: "  " });
    expect(result.ok && result.data.developmentStage).toBeNull();
  });

  it("round-trips sizes between USD and USD million", () => {
    expect(millionToUsd(0.01)).toBe("10000");
    expect(usdToMillion(millionToUsd(45.25))).toBe("45.25");
    expect(usdToMillion(null)).toBe("");
  });
});

describe("workspace upload consent", () => {
  it("gives country users the exact upload link wording and version, as in the seed", () => {
    const own = workspaceUploadAcknowledgement(false);
    expect(own).toEqual(appConfig.uploadAcknowledgement);
    expect(own.version).toBe(SEED_TEXT_VERSION);
  });

  it("has a separate wording and version for admins acting for a country", () => {
    const admin = workspaceUploadAcknowledgement(true);
    expect(admin.version).toBe(SEED_ON_BEHALF_VERSION);
    expect(admin.version).not.toBe(appConfig.uploadAcknowledgement.version);
    expect(admin.text).toMatch(/has given its consent, in writing/);
  });

  it("uses no em dashes in UI copy", () => {
    const copy = [
      workspaceUploadAcknowledgement(false).text,
      workspaceUploadAcknowledgement(true).text,
      ...Object.values(WORKSPACE_MESSAGES),
    ];
    for (const line of copy) expect(line).not.toContain("\u2014");
  });
});

describe("storage keys and headers", () => {
  it("builds teaser keys from ids only", () => {
    expect(teaserBlobKey("p1", "abc")).toBe("projects/p1/teaser/abc.pdf");
    expect(() => teaserBlobKey("../p1", "abc")).toThrow();
  });

  it("refuses unsafe keys", () => {
    for (const key of [
      "",
      "/etc/passwd",
      "../x",
      "a/../b",
      "a//b",
      "a\\b",
      ".hidden/x",
      "a/.git",
    ]) {
      expect(isSafeKey(key), key).toBe(false);
    }
    expect(isSafeKey("seed/projects/seed-project-a1/seed-doc-a1.pdf")).toBe(
      true,
    );
  });

  it("serves files privately, inline or as attachment, with a safe name", () => {
    const h = privateFileHeaders("download", 'Tea"ser é.pdf', 10);
    expect(h["Cache-Control"]).toContain("no-store");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Content-Disposition"]).toMatch(
      /^attachment; filename="Teaser e.pdf"/,
    );
    expect(h["Content-Disposition"]).toContain(
      "filename*=UTF-8''Tea%22ser%20%C3%A9.pdf",
    );
    expect(contentDisposition("view", "a.pdf")).toMatch(/^inline;/);
  });
});

describe("scan modes", () => {
  it("keeps uploads pending unless assume-clean is set", () => {
    expect(initialScan("pending")).toEqual({
      scanStatus: ScanStatus.PENDING,
      scanner: "pending",
    });
    expect(initialScan("assume-clean")).toEqual({
      scanStatus: ScanStatus.CLEAN,
      scanner: "none",
    });
  });
});
