// 22 Nov (user request): a country focal point adds projects from My projects with the upload link form. Proves
// against real PostgreSQL that only COUNTRY users may do it, only for their own ACTIVE countries (never another
// country, whatever the form sends), that the teasers become DRAFT projects with a Submission carrying the
// acknowledgement, without any upload link, and that every audit event names the account.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CountryStatus,
  MembershipRole,
  ProjectStatus,
  UserRole,
} from "@/generated/prisma/enums";
import { canSubmitFromWorkspace, type Viewer } from "@/lib/authz";
import { appConfig } from "@/lib/config";
import { db } from "@/lib/db";
import { MemoryMailer } from "@/lib/mail";
import { LocalBlobStore } from "@/lib/storage";
import {
  listWorkspaceSubmissionCountries,
  type SubmissionInput,
  type SubmissionOptions,
  SubmissionError,
  submitWorkspaceTeasers,
} from "@/lib/submission/service";
import { SUBMISSION_FIELDS } from "@/lib/submission/input";
import { readProjectTeaserFacts, uploadTeaser } from "@/lib/workspace/service";
import { createZip } from "@/lib/admin/zip";
import { buildPlaceholderPdf } from "../../prisma/seed/pdf";
import { cleanUp, createUser, viewerFor } from "./helpers";

const C = { a: "it-wsu-a", b: "it-wsu-b", x: "it-wsu-x" } as const;
const meta = { ip: "198.51.100.8", userAgent: "integration-test" };

let blobDir: string;
let opts: SubmissionOptions;
let mailer: MemoryMailer;
const v = {} as Record<
  "admin" | "focalA" | "focalAB" | "focalX" | "coordinatorA" | "investor",
  Viewer
>;

const pdf = (label: string) => ({
  name: `${label}.pdf`,
  bytes: new TextEncoder().encode(`%PDF-1.7\n% ${label}\n%%EOF\n`),
});

function input(overrides: Partial<SubmissionInput> = {}): SubmissionInput {
  return {
    uploaderName: "Fay Focal",
    uploaderEmail: "fay.focal@it.example",
    uploaderJobTitle: "Head of Projects",
    governmentOrganisation: "Ministry of Fictional Water",
    acknowledged: true,
    teasers: [{ sector: "Desalination", file: pdf("Workspace desal") }],
    ...overrides,
  };
}

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof SubmissionError) return error.code;
    throw error;
  }
  return "allowed";
}

const projectsIn = (countryId: string) =>
  db.project.count({ where: { countryId } });

beforeAll(async () => {
  await cleanUp();
  blobDir = await mkdtemp(path.join(tmpdir(), "it-wsu-blobs-"));
  mailer = new MemoryMailer();
  opts = {
    meta,
    store: new LocalBlobStore(blobDir),
    scanMode: "pending",
    mailer,
    summitEmails: ["summit@it.example"],
  };
  await db.country.createMany({
    data: [
      { id: C.a, name: "IT Workspace A", iso3: "XWA" },
      { id: C.b, name: "IT Workspace B", iso3: "XWB" },
      {
        id: C.x,
        name: "IT Workspace X",
        iso3: "XWX",
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
    return u.id;
  };
  v.admin = (await viewerFor(await make(UserRole.SUMMIT_ADMIN)))!;
  v.focalA = (await viewerFor(
    await make(UserRole.COUNTRY, MembershipRole.FOCAL_POINT, C.a),
  ))!;
  const ab = await make(UserRole.COUNTRY, MembershipRole.FOCAL_POINT, C.a);
  await db.countryMembership.create({
    data: { userId: ab, countryId: C.b, role: MembershipRole.FOCAL_POINT },
  });
  v.focalAB = (await viewerFor(ab))!;
  v.focalX = (await viewerFor(
    await make(UserRole.COUNTRY, MembershipRole.FOCAL_POINT, C.x),
  ))!;
  v.coordinatorA = (await viewerFor(
    await make(UserRole.WBG_COORDINATOR, MembershipRole.MEMBER, C.a),
  ))!;
  v.investor = (await viewerFor(await make(UserRole.INVESTOR)))!;
});

afterAll(async () => {
  await cleanUp();
  await rm(blobDir, { recursive: true, force: true });
});

describe("Add project from My projects", () => {
  it("is for country focal points only", async () => {
    expect(canSubmitFromWorkspace(v.focalA)).toBe(true);
    for (const viewer of [v.admin, v.coordinatorA, v.investor]) {
      expect(canSubmitFromWorkspace(viewer)).toBe(false);
      expect(await refusal(submitWorkspaceTeasers(viewer, input(), opts))).toBe(
        "forbidden",
      );
      expect(await listWorkspaceSubmissionCountries(viewer)).toEqual([]);
    }
    expect(await projectsIn(C.a)).toBe(0);
  });

  it("stores the teasers as draft projects of the focal point's country, with the acknowledgement and no link", async () => {
    const receipt = await submitWorkspaceTeasers(
      v.focalA,
      input({
        teasers: [
          { sector: "Desalination", file: pdf("Coastal plant") },
          { sector: "Wastewater and reuse", file: pdf("City reuse") },
        ],
      }),
      opts,
    );
    expect(receipt.countryId).toBe(C.a);
    expect(receipt.projectIds).toHaveLength(2);
    const submission = await db.submission.findUniqueOrThrow({
      where: { id: receipt.submissionId },
    });
    expect(submission.uploadLinkId).toBeNull();
    expect(submission.countryId).toBe(C.a);
    expect(submission.ackTextVersion).toBe(
      appConfig.uploadAcknowledgement.version,
    );
    const projects = await db.project.findMany({
      where: { id: { in: receipt.projectIds } },
      include: { documents: true },
    });
    expect(projects.every((p) => p.status === ProjectStatus.DRAFT)).toBe(true);
    expect(projects.every((p) => p.countryId === C.a)).toBe(true);
    expect(
      projects.every((p) => p.documents[0]?.uploadedById === v.focalA.id),
    ).toBe(true);
    // Every audit event of this submission names the account, and says it came from My projects.
    // Mail events (mail.sent, mail.failed) are written by the mail module without an actor.
    const audit = (
      await db.auditEvent.findMany({
        where: {
          entityId: {
            in: [
              receipt.submissionId,
              ...receipt.projectIds,
              ...receipt.documentIds,
            ],
          },
        },
      })
    ).filter((e) => !e.action.startsWith("mail."));
    expect(audit.length).toBeGreaterThanOrEqual(1 + 2 + 2 * 2);
    expect(audit.every((e) => e.actorId === v.focalA.id)).toBe(true);
    const created = audit.find((e) => e.action === "submission.create");
    expect(created?.metadata).toMatchObject({
      source: "workspace",
      uploadLinkId: null,
    });
    expect(mailer.sent.some((m) => m.to.includes("fay.focal@it.example"))).toBe(
      true,
    );
  });

  it("never stores for another country, whatever the form sends", async () => {
    const before = await projectsIn(C.b);
    const errors = await submitWorkspaceTeasers(
      v.focalA,
      input({ countryId: C.b }),
      opts,
    ).catch((e: unknown) => e);
    expect(errors).toBeInstanceOf(SubmissionError);
    expect((errors as SubmissionError).fieldErrors).toHaveProperty(
      SUBMISSION_FIELDS.countryId,
    );
    expect(await projectsIn(C.b)).toBe(before);
  });

  it("asks a focal point of several countries to choose one of them", async () => {
    expect(
      (await listWorkspaceSubmissionCountries(v.focalAB)).map((c) => c.id),
    ).toEqual([C.a, C.b]);
    const missing = await submitWorkspaceTeasers(
      v.focalAB,
      input(),
      opts,
    ).catch((e: unknown) => e);
    expect((missing as SubmissionError).fieldErrors).toHaveProperty(
      SUBMISSION_FIELDS.countryId,
    );
    const receipt = await submitWorkspaceTeasers(
      v.focalAB,
      input({ countryId: C.b }),
      opts,
    );
    expect(receipt.countryId).toBe(C.b);
  });

  it("refuses a switched-off country", async () => {
    expect(await listWorkspaceSubmissionCountries(v.focalX)).toEqual([]);
    const result = await submitWorkspaceTeasers(v.focalX, input(), opts).catch(
      (e: unknown) => e,
    );
    expect((result as SubmissionError).code).toBe("invalid");
    expect(await projectsIn(C.x)).toBe(0);
  });

  it("keeps the upload checks: acknowledgement and file type", async () => {
    const result = await submitWorkspaceTeasers(
      v.focalA,
      input({
        acknowledged: false,
        teasers: [
          {
            sector: "Desalination",
            file: { name: "evil.exe", bytes: new Uint8Array([77, 90, 0, 0]) },
          },
        ],
      }),
      opts,
    ).catch((e: unknown) => e);
    const fe = (result as SubmissionError).fieldErrors;
    expect(fe).toHaveProperty(SUBMISSION_FIELDS.acknowledge);
    expect(fe).toHaveProperty(SUBMISSION_FIELDS.teaser(0));
  });

  it("fills the draft project's key facts from a PDF teaser in the WBG layout (22 Nov)", async () => {
    const bytes = buildPlaceholderPdf({
      title: "IT Workspace A - COASTAL REUSE PLANT",
      subtitle: "WASTEWATER AND REUSE | North Fictional Coast",
      lines: [
        "PPP MODEL",
        "Design-Build-Operate (DBO)",
        "TOTAL PROJECT SIZE",
        "US$40-60m CAPEX",
        "DEVELOPMENT STAGE",
        "Pre-tender",
      ],
    });
    const receipt = await submitWorkspaceTeasers(
      v.focalA,
      input({
        teasers: [
          {
            sector: "Wastewater and reuse",
            file: { name: "teaser.pdf", bytes },
          },
        ],
      }),
      opts,
    );
    const project = await db.project.findUniqueOrThrow({
      where: { id: receipt.projectIds[0] },
    });
    expect(project.title).toBe("Coastal Reuse Plant");
    expect(project.sector).toBe("Wastewater and reuse");
    expect(project.region).toBe("North Fictional Coast");
    expect(project.pppModel).toBe("DBO");
    expect(project.sizeMinUsd?.toString()).toBe("40000000");
    expect(project.sizeMaxUsd?.toString()).toBe("60000000");
    expect(project.developmentStage).toBe("Pre-tender");
    const created = await db.auditEvent.findFirst({
      where: { entityId: project.id, action: "project.create" },
    });
    expect(created?.metadata).toMatchObject({
      fromTeaser: expect.arrayContaining([
        "title",
        "pppModel",
        "developmentStage",
      ]),
    });
  });

  it("keeps the file name as the title when the PDF cannot be read", async () => {
    const receipt = await submitWorkspaceTeasers(
      v.focalA,
      input({
        teasers: [{ sector: "Desalination", file: pdf("Plain_file-name") }],
      }),
      opts,
    );
    const project = await db.project.findUniqueOrThrow({
      where: { id: receipt.projectIds[0] },
    });
    expect(project.title).toBe("Plain file name");
    expect(project.pppModel).toBeNull();
  });

  it("fills only the empty fields when the Summit team uploads a new teaser, and reads facts on request", async () => {
    const receipt = await submitWorkspaceTeasers(
      v.focalA,
      input({
        teasers: [{ sector: "Desalination", file: pdf("Harbour_plant") }],
      }),
      opts,
    );
    const projectId = receipt.projectIds[0];
    // Someone already entered the stage: the teaser must not change it.
    await db.project.update({
      where: { id: projectId },
      data: { developmentStage: "RFQ" },
    });
    const bytes = buildPlaceholderPdf({
      title: "IT Workspace A - HARBOUR DESALINATION PLANT",
      lines: [
        "PPP MODEL",
        "Concession",
        "TOTAL PROJECT SIZE",
        "Up to USD 90 million",
        "DEVELOPMENT STAGE",
        "Tender RFP",
      ],
    });
    const report = { filled: [] as string[] };
    await uploadTeaser(
      v.admin,
      projectId,
      { name: "harbour.pdf", bytes },
      { allowDownload: true },
      { acknowledged: true },
      { ...opts, report },
    );
    const project = await db.project.findUniqueOrThrow({
      where: { id: projectId },
    });
    expect(project.title).toBe("Harbour Desalination Plant");
    expect(project.pppModel).toBe("Concession");
    expect(project.sizeMinUsd).toBeNull();
    expect(project.sizeMaxUsd?.toString()).toBe("90000000");
    expect(project.developmentStage).toBe("RFQ");
    expect(report.filled.sort()).toEqual(
      ["pppModel", "sizeMinUsdMillion", "title"].sort(),
    );
    // "Fill from teaser" reads everything again (nothing saved), for admins only.
    const facts = await readProjectTeaserFacts(v.admin, projectId, {
      store: opts.store,
    });
    expect(facts?.developmentStage).toBe("RFP");
    await expect(
      readProjectTeaserFacts(v.focalA, projectId, { store: opts.store }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("takes a Word teaser on every route and fills the project from it (22 Nov: same formats everywhere)", async () => {
    const word = (lines: string[]) =>
      createZip([
        {
          name: "[Content_Types].xml",
          data: new TextEncoder().encode("<Types/>"),
        },
        {
          name: "word/document.xml",
          data: new TextEncoder().encode(
            `<w:document><w:body>${lines.map((l) => `<w:p><w:r><w:t>${l}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`,
          ),
        },
      ]);
    const receipt = await submitWorkspaceTeasers(
      v.focalA,
      input({
        teasers: [
          {
            sector: "Water supply",
            file: {
              name: "teaser.docx",
              bytes: word([
                "IT Workspace A - CITY NETWORK RENEWAL",
                "PPP MODEL",
                "Affermage",
              ]),
            },
          },
        ],
      }),
      opts,
    );
    const projectId = receipt.projectIds[0];
    let project = await db.project.findUniqueOrThrow({
      where: { id: projectId },
    });
    expect(project.title).toBe("City Network Renewal");
    expect(project.pppModel).toBe("Affermage");

    // The Summit team's upload on the project page takes a Word file too, and fills the empty fields.
    await uploadTeaser(
      v.admin,
      projectId,
      {
        name: "teaser v2.docx",
        bytes: word([
          "PPP MODEL",
          "Concession",
          "DEVELOPMENT STAGE",
          "Pre-tender",
        ]),
      },
      { allowDownload: true },
      { acknowledged: true },
      opts,
    );
    project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(project.pppModel).toBe("Affermage");
    expect(project.developmentStage).toBe("Pre-tender");
    const doc = await db.document.findFirstOrThrow({
      where: { projectId, version: 2 },
    });
    expect(doc.filename).toBe("teaser v2.docx");
    expect(doc.blobKey.endsWith(".docx")).toBe(true);
  });
});
