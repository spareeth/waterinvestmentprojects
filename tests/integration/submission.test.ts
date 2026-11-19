// M0: the teaser upload link against real PostgreSQL. Proves that a link token is the only way in and fixes the
// country (a token for country A can never create or see country B data), that expired, revoked, replaced,
// unknown and malformed tokens are refused with nothing written, that every teaser is stored only with a
// Submission carrying the acknowledgement version and time, that only admins manage links and list or download
// submissions (through the policy module), and that each write leaves its AuditEvent.
//
// Note: creating a generic link revokes any other generic link in the local database (one generic link at a time).

import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CountryContactRole,
  CountryStatus,
  DocumentKind,
  MembershipRole,
  ProjectStatus,
  ScanStatus,
  UserRole,
} from "@/generated/prisma/enums";
import {
  AuthzError,
  authorizeDocumentFile,
  documentWhere,
  hashUploadToken,
  projectWhere,
  resolveUploadLink,
  submissionWhere,
  uploadLinkWhere,
  type Viewer,
} from "@/lib/authz";
import { appConfig } from "@/lib/config";
import { db } from "@/lib/db";
import { type Mailer, MemoryMailer } from "@/lib/mail";
import { type BlobStore, LocalBlobStore } from "@/lib/storage";
import {
  createUploadLink,
  getSubmissionCounts,
  getUploadLinkOverview,
  isRecentSubmission,
  listSubmissions,
  openUploadLink,
  revokeUploadLink,
  type SubmissionInput,
  type SubmissionOptions,
  SubmissionError,
  submitTeasers,
} from "@/lib/submission/service";
import { cleanUp, createUser, viewerFor } from "./helpers";

const C = { a: "it-sub-a", b: "it-sub-b", x: "it-sub-x" } as const;
const meta = { ip: "198.51.100.7", userAgent: "integration-test" };
const DAY = 24 * 60 * 60 * 1000;
const SUMMIT_MAILBOX = "summit@it.example";

let blobDir: string;
let store: LocalBlobStore;
let mailer: MemoryMailer;
let opts: SubmissionOptions;
const v = {} as Record<
  "admin" | "platformAdmin" | "focalA" | "focalB" | "investor",
  Viewer
>;

const enc = (s: string) => new TextEncoder().encode(s);
const pdf = (label: string) => ({
  name: `${label}.pdf`,
  bytes: enc(`%PDF-1.7\n% ${label}\n%%EOF\n`),
});
const pptx = (label: string) => ({
  name: `${label}.pptx`,
  bytes: enc(
    `PK\u0003\u0004 [Content_Types].xml ppt/presentation.xml ${label}`,
  ),
});

function input(overrides: Partial<SubmissionInput> = {}): SubmissionInput {
  return {
    uploaderName: "Ada Uploader",
    uploaderEmail: "ada.uploader@it.example",
    acknowledged: true,
    teasers: [{ sector: "Desalination", file: pdf("Coastal desal") }],
    ...overrides,
  };
}

function tokenOf(url: string): string {
  return url.split("/submit/")[1];
}

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof SubmissionError) return error.code;
    if (error instanceof AuthzError) return error.code;
    throw error;
  }
  return "allowed";
}

async function fieldErrors(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof SubmissionError && error.code === "invalid") {
      return error.fieldErrors;
    }
    throw error;
  }
  throw new Error("expected the submission to be refused");
}

async function blobCount(): Promise<number> {
  const files = await readdir(blobDir, {
    recursive: true,
    withFileTypes: true,
  });
  return files.filter((f) => f.isFile()).length;
}

async function counts() {
  const countries = { in: [C.a, C.b, C.x] };
  return {
    submissions: await db.submission.count({
      where: { countryId: countries },
    }),
    projects: await db.project.count({ where: { countryId: countries } }),
    blobs: await blobCount(),
  };
}

async function auditActions(entityId: string): Promise<string[]> {
  const rows = await db.auditEvent.findMany({
    where: { entityId },
    orderBy: { at: "asc" },
    select: { action: true },
  });
  return rows.map((r) => r.action);
}

beforeAll(async () => {
  await cleanUp();
  blobDir = await mkdtemp(path.join(tmpdir(), "it-sub-blobs-"));
  store = new LocalBlobStore(blobDir);
  mailer = new MemoryMailer();
  opts = {
    meta,
    store,
    scanMode: "pending",
    mailer,
    summitEmails: [SUMMIT_MAILBOX],
  };
  await db.country.createMany({
    data: [
      { id: C.a, name: "IT Upload A", iso3: "XUA" },
      { id: C.b, name: "IT Upload B", iso3: "XUB" },
      {
        id: C.x,
        name: "IT Upload X",
        iso3: "XUX",
        status: CountryStatus.INACTIVE,
      },
    ],
  });
  const make = async (
    role: UserRole,
    membershipRole?: MembershipRole,
    countryId?: string,
  ) => {
    const u = await createUser({
      role,
      membershipRole,
      countryId,
      termsAccepted: true,
      mfaEnabled: true,
    });
    return (await viewerFor(u.id))!;
  };
  v.admin = await make(UserRole.SUMMIT_ADMIN);
  v.platformAdmin = await make(UserRole.PLATFORM_ADMIN);
  v.focalA = await make(UserRole.COUNTRY, MembershipRole.FOCAL_POINT, C.a);
  v.focalB = await make(UserRole.COUNTRY, MembershipRole.FOCAL_POINT, C.b);
  v.investor = await make(UserRole.INVESTOR);
});

afterAll(async () => {
  await cleanUp();
  await rm(blobDir, { recursive: true, force: true });
});

describe("upload links (admin)", () => {
  it("lets only admins create, revoke or list links", async () => {
    const expiresAt = new Date(Date.now() + 7 * DAY);
    for (const viewer of [v.focalA, v.focalB, v.investor]) {
      expect(
        await refusal(
          createUploadLink(viewer, { countryId: C.a, expiresAt }, opts),
        ),
      ).toBe("forbidden");
      expect(await refusal(getUploadLinkOverview(viewer))).toBe("forbidden");
      expect(await refusal(revokeUploadLink(viewer, "any-id", opts))).toBe(
        "forbidden",
      );
      expect(
        await db.uploadLink.count({ where: uploadLinkWhere(viewer) }),
      ).toBe(0);
    }
    expect(await db.uploadLink.count({ where: uploadLinkWhere(null) })).toBe(0);
  });

  it("stores only the token hash, shows the URL once and replaces the previous link", async () => {
    const expiresAt = new Date(Date.now() + 7 * DAY);
    const first = await createUploadLink(
      v.admin,
      { countryId: C.a, expiresAt },
      opts,
    );
    const token1 = tokenOf(first.url);
    expect(token1).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const row = await db.uploadLink.findUniqueOrThrow({
      where: { id: first.id },
    });
    expect(row.tokenHash).toBe(hashUploadToken(token1));
    expect(JSON.stringify(row)).not.toContain(token1);
    expect(row.countryId).toBe(C.a);
    expect(first.countryName).toBe("IT Upload A");

    const second = await createUploadLink(
      v.platformAdmin,
      { countryId: C.a, expiresAt },
      opts,
    );
    expect((await resolveUploadLink(token1)).state).toBe("revoked");
    expect((await resolveUploadLink(tokenOf(second.url))).state).toBe("valid");
    expect(await auditActions(first.id)).toEqual([
      "upload_link.create",
      "upload_link.revoke",
    ]);
    const overview = await getUploadLinkOverview(v.admin);
    const a = overview.countries.find((c) => c.id === C.a);
    expect(a?.link?.id).toBe(second.id);
    expect(a?.link?.state).toBe("valid");
    // Inactive countries get no link and are not listed.
    expect(overview.countries.some((c) => c.id === C.x)).toBe(false);
    expect(
      await refusal(
        createUploadLink(v.admin, { countryId: C.x, expiresAt }, opts),
      ),
    ).toBe("invalid");
  });

  it("refuses expiry dates in the past or too far ahead", async () => {
    for (const expiresAt of [
      new Date(Date.now() - DAY),
      new Date(Date.now() + 365 * DAY),
      new Date(Number.NaN),
    ]) {
      expect(
        await refusal(
          createUploadLink(v.admin, { countryId: C.b, expiresAt }, opts),
        ),
      ).toBe("invalid");
    }
  });
});

describe("submitting through a country link", () => {
  let tokenA: string;
  let tokenB: string;
  let submissionId: string;
  let documentIds: string[];

  beforeAll(async () => {
    const expiresAt = new Date(Date.now() + 7 * DAY);
    tokenA = tokenOf(
      (await createUploadLink(v.admin, { countryId: C.a, expiresAt }, opts))
        .url,
    );
    tokenB = tokenOf(
      (await createUploadLink(v.admin, { countryId: C.b, expiresAt }, opts))
        .url,
    );
  });

  it("shows the link's own country only, and audits the opening", async () => {
    const page = await openUploadLink(tokenA, { meta });
    expect(page.state).toBe("valid");
    expect(page.country).toEqual({ id: C.a, name: "IT Upload A" });
    expect(page.countries).toEqual([]);
    const link = await resolveUploadLink(tokenA);
    expect(await auditActions(link.link!.id)).toContain("upload_link.open");
  });

  it("stores a Submission with the acknowledgement and DRAFT projects for the link's country only", async () => {
    const before = await counts();
    mailer.sent.length = 0;
    const now = new Date();
    const receipt = await submitTeasers(
      tokenA,
      input({
        // A country link fixes the country: this attempt to file under B is ignored.
        countryId: C.b,
        uploaderEmail: "  Ada.Uploader@IT.example ",
        teasers: [
          { sector: "Desalination", file: pdf("Coastal_desal-plant") },
          { sector: "Irrigation", file: pptx("Valley irrigation") },
        ],
      }),
      { ...opts, now },
    );
    submissionId = receipt.submissionId;
    documentIds = receipt.documentIds;
    // The receipt is what the confirmation page shows.
    expect(receipt).toMatchObject({
      countryId: C.a,
      countryName: "IT Upload A",
      uploaderName: "Ada Uploader",
      uploaderEmail: "ada.uploader@it.example",
      acceptedAt: now,
      files: [
        { filename: "Coastal_desal-plant.pdf", sector: "Desalination" },
        { filename: "Valley irrigation.pptx", sector: "Irrigation" },
      ],
      emailSent: true,
    });

    const submission = await db.submission.findUniqueOrThrow({
      where: { id: submissionId },
      include: {
        projects: { include: { documents: true }, orderBy: { title: "asc" } },
      },
    });
    expect(submission).toMatchObject({
      countryId: C.a,
      uploaderName: "Ada Uploader",
      uploaderEmail: "ada.uploader@it.example",
      ackTextVersion: appConfig.uploadAcknowledgement.version,
      ip: meta.ip,
    });
    expect(submission.ackAcceptedAt.getTime()).toBe(now.getTime());
    expect(submission.projects.map((p) => p.title)).toEqual([
      "Coastal desal plant",
      "Valley irrigation",
    ]);
    for (const p of submission.projects) {
      expect(p.countryId).toBe(C.a);
      expect(p.status).toBe(ProjectStatus.DRAFT);
      expect(p.developmentStage).toBeNull();
      expect(p.documents).toHaveLength(1);
      const [d] = p.documents;
      expect(d).toMatchObject({
        submissionId,
        kind: DocumentKind.TEASER,
        version: 1,
        allowDownload: true,
        uploadedById: null,
        scanStatus: ScanStatus.PENDING,
        supersededById: null,
      });
      expect(d.blobKey).toMatch(
        /^submissions\/[0-9a-f-]+\/[0-9a-f-]+\.(pdf|pptx)$/,
      );
    }
    const pptxDoc = submission.projects[1].documents[0];
    expect(pptxDoc.filename).toBe("Valley irrigation.pptx");
    expect(pptxDoc.sha256).toBe(
      createHash("sha256")
        .update(pptx("Valley irrigation").bytes)
        .digest("hex"),
    );

    const after = await counts();
    expect(after.submissions).toBe(before.submissions + 1);
    expect(after.projects).toBe(before.projects + 2);
    expect(after.blobs).toBe(before.blobs + 2);
    // Nothing for country B.
    expect(await db.submission.count({ where: { countryId: C.b } })).toBe(0);
    expect(await db.project.count({ where: { countryId: C.b } })).toBe(0);

    expect(await auditActions(submissionId)).toEqual([
      "submission.create",
      "mail.sent",
      "mail.sent",
    ]);
    for (const p of submission.projects) {
      expect(await auditActions(p.id)).toEqual(["project.create"]);
      expect(await auditActions(p.documents[0].id)).toEqual([
        "document.upload",
        "document.scan",
      ]);
    }
  });

  it("emails a confirmation to the uploader and a notice to the Summit mailbox", () => {
    const [confirmation, notice] = mailer.sent;
    expect(mailer.sent).toHaveLength(2);
    expect(confirmation.to).toEqual(["ada.uploader@it.example"]);
    expect(confirmation.subject).toContain("IT Upload A");
    expect(confirmation.text).toContain("Coastal_desal-plant.pdf");
    expect(confirmation.text).toContain("Valley irrigation.pptx");
    expect(confirmation.text).toContain(appConfig.uploadAcknowledgement.text);
    expect(confirmation.text).toContain(submissionId);
    expect(notice.to).toEqual([SUMMIT_MAILBOX]);
    expect(notice.subject).toBe("New teaser submission: IT Upload A (2 files)");
    expect(notice.text).toContain("ada.uploader@it.example");
    expect(notice.text).toContain("/admin/submissions");
    for (const m of mailer.sent) {
      expect(`${m.subject}\n${m.text}`).not.toMatch(/—/);
      expect(`${m.subject}\n${m.text}`).not.toMatch(/tier/i);
    }
  });

  it("makes the uploader country A's focal point contact, once per address", async () => {
    const contacts = await db.countryContact.findMany({
      where: { countryId: C.a },
    });
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({
      name: "Ada Uploader",
      email: "ada.uploader@it.example",
      role: CountryContactRole.FOCAL_POINT,
      userId: null,
    });
    expect(await auditActions(contacts[0].id)).toEqual([
      "country_contact.create",
    ]);
    // Same person again (address typed differently, new name): no second contact, the first is unchanged.
    await submitTeasers(
      tokenA,
      input({
        uploaderName: "Ada U.",
        uploaderEmail: "ADA.Uploader@it.example",
      }),
      opts,
    );
    const again = await db.countryContact.findMany({
      where: { countryId: C.a },
    });
    expect(again).toHaveLength(1);
    expect(again[0].name).toBe("Ada Uploader");
    // A contact is only ever made for the link's own country.
    expect(
      await db.countryContact.count({
        where: { email: "ada.uploader@it.example", countryId: { not: C.a } },
      }),
    ).toBe(0);
  });

  it("keeps country B's link to country B, whatever the form says", async () => {
    const receipt = await submitTeasers(
      tokenB,
      input({ countryId: C.a, uploaderEmail: "bea@it.example" }),
      opts,
    );
    expect(receipt.countryId).toBe(C.b);
    const projects = await db.project.findMany({
      where: { submissionId: receipt.submissionId },
      select: { countryId: true },
    });
    expect(projects).toEqual([{ countryId: C.b }]);
    // Country A's submission is untouched and still has exactly its own two projects.
    expect(
      await db.project.count({ where: { submissionId, countryId: C.a } }),
    ).toBe(2);
    // The B uploader became B's contact, never A's.
    expect(
      await db.countryContact.findMany({
        where: { email: "bea@it.example" },
        select: { countryId: true },
      }),
    ).toEqual([{ countryId: C.b }]);
  });

  it("lets admins list every submission and nobody else", async () => {
    const list = await listSubmissions(v.admin, { meta });
    const mine = list.filter((s) =>
      ([C.a, C.b] as string[]).includes(s.country.id),
    );
    expect([...new Set(mine.map((s) => s.country.id))].sort()).toEqual([
      C.a,
      C.b,
    ]);
    expect(
      list
        .find((s) => s.id === submissionId)
        ?.documents.map((d) => d.id)
        .sort(),
    ).toEqual([...documentIds].sort());
    for (const viewer of [v.focalA, v.focalB, v.investor]) {
      expect(await refusal(listSubmissions(viewer))).toBe("forbidden");
      expect(
        await db.submission.count({ where: submissionWhere(viewer) }),
      ).toBe(0);
    }
    expect(await db.submission.count({ where: submissionWhere(null) })).toBe(0);
  });

  it("lets admins download the unscanned files through the policy module; nobody else gets them", async () => {
    const [docId] = documentIds;
    const file = await authorizeDocumentFile(v.admin, docId, "download", {
      meta,
    });
    expect(file.scanStatus).toBe(ScanStatus.PENDING);
    const stored = await store.get(file.blobKey);
    expect(stored?.sizeBytes).toBe(file.sizeBytes);
    await stored?.stream.cancel();
    const download = await db.auditEvent.findFirst({
      where: { entityId: docId, action: "document.download" },
      select: { actorId: true, metadata: true },
    });
    expect(download?.actorId).toBe(v.admin.id);
    expect(download?.metadata).toMatchObject({ scanStatus: "PENDING" });

    // Unscanned files cannot be opened in the browser, even by admins.
    expect(
      await refusal(authorizeDocumentFile(v.admin, docId, "view", { meta })),
    ).toBe("forbidden");
    // Country A sees its own draft but may not take an unscanned file.
    expect(
      await refusal(
        authorizeDocumentFile(v.focalA, docId, "download", { meta }),
      ),
    ).toBe("forbidden");
    // Other countries and investors do not even learn that it exists.
    for (const viewer of [v.focalB, v.investor, null]) {
      expect(
        await refusal(
          authorizeDocumentFile(viewer, docId, "download", { meta }),
        ),
      ).toBe("not_found");
    }
    // Even once scanned clean, a DRAFT stays out of the pipeline.
    await db.document.update({
      where: { id: docId },
      data: { scanStatus: ScanStatus.CLEAN },
    });
    for (const viewer of [v.focalB, v.investor]) {
      expect(
        await db.document.count({
          where: { AND: [{ id: docId }, documentWhere(viewer)] },
        }),
      ).toBe(0);
      expect(
        await db.project.count({
          where: { AND: [{ submissionId }, projectWhere(viewer)] },
        }),
      ).toBe(0);
    }
    expect(
      await db.project.count({
        where: { AND: [{ submissionId }, projectWhere(v.focalA)] },
      }),
    ).toBe(2);
  });
});

describe("refused links write nothing", () => {
  it("refuses unknown, malformed, revoked, expired and inactive-country tokens", async () => {
    const now = new Date();
    const expired = await createUploadLink(
      v.admin,
      { countryId: C.b, expiresAt: new Date(now.getTime() + 60 * 60 * 1000) },
      opts,
    );
    const revoked = await createUploadLink(
      v.admin,
      { countryId: C.a, expiresAt: new Date(now.getTime() + DAY) },
      opts,
    );
    await revokeUploadLink(v.admin, revoked.id, opts);
    // Revoking twice changes nothing.
    await revokeUploadLink(v.admin, revoked.id, opts);
    expect(await auditActions(revoked.id)).toEqual([
      "upload_link.create",
      "upload_link.revoke",
    ]);
    const inactiveToken = "x".repeat(43);
    await db.uploadLink.create({
      data: {
        countryId: C.x,
        tokenHash: hashUploadToken(inactiveToken),
        expiresAt: new Date(now.getTime() + DAY),
        createdById: v.admin.id,
      },
    });

    const before = await counts();
    const later = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const cases: [string, string, Date][] = [
      ["unknown", "y".repeat(43), now],
      ["malformed", "../../etc/passwd", now],
      ["empty", "", now],
      ["revoked", tokenOf(revoked.url), now],
      ["inactive", inactiveToken, now],
      ["expired", tokenOf(expired.url), later],
    ];
    for (const [label, token, at] of cases) {
      const code = await refusal(
        submitTeasers(token, input(), { ...opts, now: at }),
      );
      expect(code, label).toBe(
        label === "expired" ? "link_expired" : "link_invalid",
      );
      expect((await openUploadLink(token, { meta, now: at })).state).not.toBe(
        "valid",
      );
    }
    expect(await counts()).toEqual(before);
    expect(
      await db.auditEvent.count({
        where: {
          action: "upload_link.refused",
          userAgent: "integration-test",
        },
      }),
    ).toBeGreaterThanOrEqual(cases.length * 2);
  });

  it("removes the stored files when the link is revoked while uploading", async () => {
    const link = await createUploadLink(
      v.admin,
      { countryId: C.a, expiresAt: new Date(Date.now() + DAY) },
      opts,
    );
    // A store that revokes the link as soon as the file is written (an admin pressing Revoke meanwhile).
    const racing: BlobStore = {
      put: async (key, bytes) => {
        await store.put(key, bytes);
        await db.uploadLink.update({
          where: { id: link.id },
          data: { revokedAt: new Date() },
        });
      },
      get: (key) => store.get(key),
      delete: (key) => store.delete(key),
    };
    const before = await counts();
    expect(
      await refusal(
        submitTeasers(tokenOf(link.url), input(), { ...opts, store: racing }),
      ),
    ).toBe("link_invalid");
    expect(await counts()).toEqual(before);
  });
});

describe("validation", () => {
  let token: string;

  beforeAll(async () => {
    token = tokenOf(
      (
        await createUploadLink(
          v.admin,
          { countryId: C.a, expiresAt: new Date(Date.now() + DAY) },
          opts,
        )
      ).url,
    );
  });

  it("refuses incomplete forms and wrong files without storing anything", async () => {
    const before = await counts();
    const big = {
      name: "big.pdf",
      bytes: new Uint8Array(25 * 1024 * 1024 + 1),
    };
    big.bytes.set(enc("%PDF-1.7"));
    // Three files of 21 MB: each within 25 MB, together over the 60 MB limit.
    const almostFull = () => {
      const bytes = new Uint8Array(21 * 1024 * 1024);
      bytes.set(enc("%PDF-1.7"));
      return { name: "part.pdf", bytes };
    };

    expect(
      await fieldErrors(
        submitTeasers(
          token,
          input({ acknowledged: false, uploaderEmail: "not-an-email" }),
          opts,
        ),
      ),
    ).toMatchObject({
      acknowledge: expect.any(String),
      uploaderEmail: expect.any(String),
    });
    expect(
      await fieldErrors(
        submitTeasers(
          token,
          input({ uploaderName: "Ada\nBcc: someone@example.org" }),
          opts,
        ),
      ),
    ).toHaveProperty("uploaderName");
    expect(
      await fieldErrors(
        submitTeasers(
          token,
          input({
            teasers: [
              { sector: "Space mining", file: pdf("a") },
              {
                sector: "Irrigation",
                file: { name: "a.pdf", bytes: enc("MZ\u0090 not a pdf") },
              },
              {
                sector: "Irrigation",
                file: {
                  name: "deck.pptx",
                  bytes: enc("PK\u0003\u0004 word/document.xml"),
                },
              },
              {
                sector: "Irrigation",
                file: { name: "macro.pptm", bytes: pptx("m").bytes },
              },
              { sector: "Irrigation", file: null },
            ],
          }),
          opts,
        ),
      ),
    ).toMatchObject({
      "sector-0": expect.any(String),
      "teaser-1": expect.any(String),
      "teaser-2": expect.any(String),
      "teaser-3": expect.any(String),
      "teaser-4": expect.any(String),
    });
    expect(
      await fieldErrors(
        submitTeasers(
          token,
          input({ teasers: [{ sector: "Irrigation", file: big }] }),
          opts,
        ),
      ),
    ).toHaveProperty("teaser-0");
    expect(
      await fieldErrors(
        submitTeasers(
          token,
          input({
            teasers: Array.from({ length: 6 }, (_, i) => ({
              sector: "Irrigation",
              file: pdf(`t${i}`),
            })),
          }),
          opts,
        ),
      ),
    ).toHaveProperty("teasers");
    expect(
      await fieldErrors(
        submitTeasers(
          token,
          input({
            teasers: [1, 2, 3].map(() => ({
              sector: "Irrigation",
              file: almostFull(),
            })),
          }),
          opts,
        ),
      ),
    ).toHaveProperty("teasers");
    expect(
      await fieldErrors(submitTeasers(token, input({ teasers: [] }), opts)),
    ).toHaveProperty("teasers");
    expect(await counts()).toEqual(before);
  });
});

describe("generic link", () => {
  let token: string;

  beforeAll(async () => {
    token = tokenOf(
      (
        await createUploadLink(
          v.admin,
          { countryId: null, expiresAt: new Date(Date.now() + DAY) },
          opts,
        )
      ).url,
    );
  });

  it("lists active countries and files the submission under the chosen one", async () => {
    const page = await openUploadLink(token, { meta });
    expect(page.country).toBeNull();
    const ids = page.countries.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining([C.a, C.b]));
    expect(ids).not.toContain(C.x);

    const receipt = await submitTeasers(
      token,
      input({ countryId: C.b, uploaderEmail: "generic@it.example" }),
      opts,
    );
    expect(receipt.countryId).toBe(C.b);
    const submission = await db.submission.findUniqueOrThrow({
      where: { id: receipt.submissionId },
      select: { uploadLink: { select: { countryId: true } } },
    });
    expect(submission.uploadLink?.countryId).toBeNull();
  });

  it("refuses a missing, unknown or inactive country", async () => {
    const before = await counts();
    for (const countryId of [null, "", "it-sub-nowhere", C.x]) {
      expect(
        await fieldErrors(submitTeasers(token, input({ countryId }), opts)),
      ).toHaveProperty("countryId");
    }
    expect(await counts()).toEqual(before);
  });
});

describe("email delivery", () => {
  let token: string;

  beforeAll(async () => {
    token = tokenOf(
      (
        await createUploadLink(
          v.admin,
          { countryId: C.a, expiresAt: new Date(Date.now() + DAY) },
          opts,
        )
      ).url,
    );
  });

  it("keeps the submission and audits the failure when the mail server is down", async () => {
    const down: Mailer = {
      delivers: true,
      send: async () => {
        throw new Error("mail server down");
      },
    };
    const receipt = await submitTeasers(token, input(), {
      ...opts,
      mailer: down,
    });
    expect(receipt.emailSent).toBe(false);
    expect(
      await db.submission.count({ where: { id: receipt.submissionId } }),
    ).toBe(1);
    expect(await auditActions(receipt.submissionId)).toEqual([
      "submission.create",
      "mail.failed",
      "mail.failed",
    ]);
  });

  it("does not claim an email was sent when the log driver is used", async () => {
    const logOnly = new MemoryMailer(false);
    const receipt = await submitTeasers(token, input(), {
      ...opts,
      mailer: logOnly,
    });
    expect(receipt.emailSent).toBe(false);
    expect(logOnly.sent).toHaveLength(2);
  });

  it("skips the Summit notice when no mailbox is configured", async () => {
    const quiet = new MemoryMailer();
    const receipt = await submitTeasers(token, input(), {
      ...opts,
      mailer: quiet,
      summitEmails: [],
    });
    expect(receipt.emailSent).toBe(true);
    expect(quiet.sent.map((m) => m.to)).toEqual([["ada.uploader@it.example"]]);
  });
});

describe("admin notification (counts)", () => {
  it("counts a new submission for admins and shows nobody else anything", async () => {
    const token = tokenOf(
      (
        await createUploadLink(
          v.admin,
          { countryId: C.a, expiresAt: new Date(Date.now() + DAY) },
          opts,
        )
      ).url,
    );
    const before = await getSubmissionCounts(v.admin);
    const receipt = await submitTeasers(
      token,
      input({
        teasers: [
          { sector: "Irrigation", file: pdf("one") },
          { sector: "Desalination", file: pdf("two") },
        ],
      }),
      opts,
    );
    const after = await getSubmissionCounts(v.admin);
    expect(after.submissions).toBe(before.submissions + 1);
    expect(after.teasers).toBe(before.teasers + 2);
    expect(after.recent).toBe(before.recent + 1);
    expect(after.countriesWithSubmissions).toBe(
      before.countriesWithSubmissions,
    );
    expect(after.activeCountries).toBeGreaterThanOrEqual(2);
    // A day later the submission is no longer "new".
    const tomorrow = new Date(receipt.acceptedAt.getTime() + DAY + 1000);
    expect(
      (await getSubmissionCounts(v.admin, { now: tomorrow })).recent,
    ).toBeLessThan(after.recent);
    expect(isRecentSubmission(receipt.acceptedAt, new Date())).toBe(true);
    expect(isRecentSubmission(receipt.acceptedAt, tomorrow)).toBe(false);

    for (const viewer of [v.focalA, v.focalB, v.investor]) {
      expect(await getSubmissionCounts(viewer)).toEqual({
        submissions: 0,
        teasers: 0,
        recent: 0,
        countriesWithSubmissions: 0,
        activeCountries: 0,
      });
    }
  });
});
