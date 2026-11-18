// M5, updated for PLAN v0.3 in M1: the country workspace service against real PostgreSQL. Proves that every
// action goes through the policy module (cross-country and cross-project isolation, member versus focal point
// versus admin on behalf), that no teaser is stored without a Submission carrying the consent wording version and
// time (one per upload, the signed-in user as uploader), that publishing needs a current clean teaser, that
// teaser versions form a linear supersededById chain, and that each write leaves its AuditEvent.

import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  MembershipRole,
  PipelineScope,
  ProjectStatus,
  ProjectType,
  ScanStatus,
  UserRole,
} from "@/generated/prisma/enums";
import {
  AuthzError,
  authorizeDocumentFile,
  documentWhere,
  projectWhere,
  type Viewer,
} from "@/lib/authz";
import { appConfig } from "@/lib/config";
import { db } from "@/lib/db";
import { LocalBlobStore } from "@/lib/storage";
import type { ProjectInput } from "@/lib/workspace/project-input";
import {
  createProject,
  getWorkspaceProject,
  listWorkspaceProjects,
  publishProject,
  setTeaserDownload,
  updateProject,
  uploadTeaser,
  WorkspaceError,
  type WorkspaceOptions,
  withdrawProject,
} from "@/lib/workspace/service";
import { cleanUp, createUser, viewerFor } from "./helpers";

const C = { a: "it-ws-a", b: "it-ws-b" } as const;
const meta = { ip: "198.51.100.7", userAgent: "integration-test" };

let blobDir: string;
let store: LocalBlobStore;
let opts: WorkspaceOptions;
const v = {} as Record<
  "admin" | "focalA" | "memberA" | "focalB" | "investor",
  Viewer
>;
const email = {} as Record<keyof typeof v, string>;

const input = (title: string): ProjectInput => ({
  title,
  sector: "Desalination",
  projectType: ProjectType.SUMMIT_PIPELINE,
  pppModel: null,
  sizeMinUsd: "10000000",
  sizeMaxUsd: "20000000",
  developmentStage: null,
});

const pdf = (label: string) => ({
  name: `${label}.pdf`,
  bytes: new TextEncoder().encode(`%PDF-1.7\n% ${label}\n%%EOF\n`),
});
const view = { allowDownload: false };
const consent = { acknowledged: true };

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof WorkspaceError) return error.code;
    throw error;
  }
  return "allowed";
}

async function blobCount(): Promise<number> {
  const files = await readdir(blobDir, {
    recursive: true,
    withFileTypes: true,
  });
  return files.filter((f) => f.isFile()).length;
}

async function auditActions(entityId: string): Promise<string[]> {
  const rows = await db.auditEvent.findMany({
    where: { entityId },
    orderBy: { at: "asc" },
    select: { action: true },
  });
  return rows.map((r) => r.action);
}

/** Submissions of the two test countries. */
const submissionCount = () =>
  db.submission.count({ where: { countryId: { in: [C.a, C.b] } } });

beforeAll(async () => {
  await cleanUp();
  blobDir = await mkdtemp(path.join(tmpdir(), "it-ws-blobs-"));
  store = new LocalBlobStore(blobDir);
  opts = { meta, store, scanMode: "assume-clean" };
  await db.country.createMany({
    data: [
      { id: C.a, name: "IT Workspace A", iso3: "XWA" },
      { id: C.b, name: "IT Workspace B", iso3: "XWB" },
    ],
  });
  const make = async (
    key: keyof typeof v,
    role: UserRole,
    membershipRole?: MembershipRole,
    countryId?: string,
    pipelineScope: PipelineScope = PipelineScope.NONE,
  ) => {
    const u = await createUser({
      role,
      membershipRole,
      countryId,
      pipelineScope,
      termsAccepted: true,
      mfaEnabled: true,
    });
    v[key] = (await viewerFor(u.id))!;
    email[key] = u.email;
  };
  await make("admin", UserRole.SUMMIT_ADMIN);
  await make("focalA", UserRole.COUNTRY, MembershipRole.FOCAL_POINT, C.a);
  await make("memberA", UserRole.COUNTRY, MembershipRole.MEMBER, C.a);
  // Country B's focal point also sees the whole pipeline, which must not open A's workspace.
  await make(
    "focalB",
    UserRole.COUNTRY,
    MembershipRole.FOCAL_POINT,
    C.b,
    PipelineScope.ALL,
  );
  await make(
    "investor",
    UserRole.INVESTOR,
    undefined,
    undefined,
    PipelineScope.ALL,
  );
});

afterAll(async () => {
  await cleanUp();
  await rm(blobDir, { recursive: true, force: true });
});

describe("country workspace", () => {
  let projectId: string;
  let v1: string;
  let v2: string;

  it("lets a member create a draft in their own country only", async () => {
    projectId = await createProject(
      v.memberA,
      C.a,
      input("Workspace one"),
      opts,
    );
    const project = await db.project.findUniqueOrThrow({
      where: { id: projectId },
    });
    expect(project.status).toBe(ProjectStatus.DRAFT);
    expect(project.countryId).toBe(C.a);
    expect(project.title).toBe("Workspace one");
    expect(await auditActions(projectId)).toEqual(["project.create"]);

    expect(await refusal(createProject(v.memberA, C.b, input("x"), opts))).toBe(
      "forbidden",
    );
    expect(
      await refusal(createProject(v.investor, C.a, input("x"), opts)),
    ).toBe("forbidden");
    expect(
      await refusal(createProject(v.admin, "it-ws-missing", input("x"), opts)),
    ).toBe("not_found");
  });

  it("keeps other countries and investors out of the workspace", async () => {
    expect(await getWorkspaceProject(v.focalB, projectId)).toBeNull();
    expect(await getWorkspaceProject(v.investor, projectId)).toBeNull();
    const listB = await listWorkspaceProjects(v.focalB);
    expect(listB.some((p) => p.country.id === C.a)).toBe(false);
    expect(await listWorkspaceProjects(v.investor)).toEqual([]);
    const own = await getWorkspaceProject(v.memberA, projectId, opts);
    expect(own?.permissions).toMatchObject({ edit: true, publish: false });
  });

  it("updates key fields (title, development stage) and records which ones changed", async () => {
    const changed = await updateProject(
      v.memberA,
      projectId,
      { ...input("Workspace one, renamed"), developmentStage: "Feasibility" },
      opts,
    );
    expect(changed.sort()).toEqual(["developmentStage", "title"]);
    expect(
      await updateProject(
        v.memberA,
        projectId,
        { ...input("Workspace one, renamed"), developmentStage: "Feasibility" },
        opts,
      ),
    ).toEqual([]);
    expect(
      await refusal(updateProject(v.focalB, projectId, input("Hijack"), opts)),
    ).toBe("not_found");
    expect(
      await refusal(
        updateProject(v.investor, projectId, input("Hijack"), opts),
      ),
    ).toBe("not_found");
    const audit = await db.auditEvent.findFirstOrThrow({
      where: { entityId: projectId, action: "project.update" },
    });
    expect(audit.actorId).toBe(v.memberA.id);
    expect(audit.metadata).toMatchObject({ changed: expect.any(Array) });
  });

  it("refuses an upload without the consent tick, storing nothing", async () => {
    const [blobs, submissions] = [await blobCount(), await submissionCount()];
    for (const ack of [null, { acknowledged: false }]) {
      expect(
        await refusal(
          uploadTeaser(v.memberA, projectId, pdf("v1"), view, ack, opts),
        ),
      ).toBe("ack_required");
    }
    expect(await blobCount()).toBe(blobs);
    expect(await submissionCount()).toBe(submissions);
    expect(await db.document.count({ where: { projectId } })).toBe(0);
  });

  it("stores a teaser with its own Submission (consent version and time), sha256, scan status and audit", async () => {
    const file = pdf("v1");
    const now = new Date("2026-11-19T08:00:00Z");
    v1 = await uploadTeaser(v.memberA, projectId, file, view, consent, {
      ...opts,
      now,
    });
    const doc = await db.document.findUniqueOrThrow({
      where: { id: v1 },
      include: { submission: true },
    });
    expect(doc).toMatchObject({
      version: 1,
      kind: "TEASER",
      scanStatus: ScanStatus.CLEAN,
      supersededById: null,
      sizeBytes: file.bytes.byteLength,
      sha256: createHash("sha256").update(file.bytes).digest("hex"),
      filename: "v1.pdf",
      uploadedById: v.memberA.id,
    });
    expect(doc.submission).toMatchObject({
      countryId: C.a,
      uploadLinkId: null,
      uploaderName: "Integration Tester",
      uploaderEmail: email.memberA,
      ackTextVersion: appConfig.uploadAcknowledgement.version,
      ip: meta.ip,
    });
    expect(doc.submission.ackAcceptedAt.getTime()).toBe(now.getTime());
    // The project keeps no link submission; only link projects carry Project.submissionId.
    expect(
      (await db.project.findUniqueOrThrow({ where: { id: projectId } }))
        .submissionId,
    ).toBeNull();
    // A portal uploader is not made a request-inbox contact (they already have an account).
    expect(await db.countryContact.count({ where: { countryId: C.a } })).toBe(
      0,
    );
    expect(doc.blobKey).toMatch(new RegExp(`^projects/${projectId}/teaser/`));
    expect(await store.get(doc.blobKey)).not.toBeNull();
    expect(await auditActions(v1)).toEqual([
      "document.upload",
      "document.scan",
    ]);
    expect(await auditActions(doc.submissionId)).toEqual(["submission.create"]);
  });

  it("refuses bad files and other countries' or investors' uploads, storing nothing", async () => {
    const [blobs, submissions] = [await blobCount(), await submissionCount()];
    const file = pdf("bad");
    expect(
      await refusal(
        uploadTeaser(
          v.memberA,
          projectId,
          { name: "deck.pptx", bytes: file.bytes },
          view,
          consent,
          opts,
        ),
      ),
    ).toBe("file_not_pdf");
    expect(
      await refusal(
        uploadTeaser(
          v.memberA,
          projectId,
          { name: "fake.pdf", bytes: new TextEncoder().encode("hello") },
          view,
          consent,
          opts,
        ),
      ),
    ).toBe("file_not_pdf");
    // Cross-country and investor: the project does not even exist for them.
    expect(
      await refusal(
        uploadTeaser(v.focalB, projectId, pdf("x"), view, consent, opts),
      ),
    ).toBe("not_found");
    expect(
      await refusal(
        uploadTeaser(v.investor, projectId, pdf("x"), view, consent, opts),
      ),
    ).toBe("not_found");
    expect(await blobCount()).toBe(blobs);
    expect(await submissionCount()).toBe(submissions);
    expect(await db.submission.count({ where: { countryId: C.b } })).toBe(0);
  });

  it("does not let a member or another country publish", async () => {
    expect(await refusal(publishProject(v.memberA, projectId, opts))).toBe(
      "forbidden",
    );
    expect(await refusal(publishProject(v.focalB, projectId, opts))).toBe(
      "not_found",
    );
    expect(await refusal(publishProject(v.investor, projectId, opts))).toBe(
      "not_found",
    );
    expect(
      (await db.project.findUniqueOrThrow({ where: { id: projectId } })).status,
    ).toBe(ProjectStatus.DRAFT);
  });

  it("publishes the current clean teaser, whose Submission holds the consent", async () => {
    await publishProject(v.focalA, projectId, {
      ...opts,
      allowDownload: true,
    });
    const project = await db.project.findUniqueOrThrow({
      where: { id: projectId },
    });
    expect(project.status).toBe(ProjectStatus.PUBLISHED);
    expect(project.publishedAt).not.toBeNull();
    expect(
      (await db.document.findUniqueOrThrow({ where: { id: v1 } }))
        .allowDownload,
    ).toBe(true);
    const publish = await db.auditEvent.findFirstOrThrow({
      where: { entityId: projectId, action: "project.publish" },
    });
    expect(publish.metadata).toMatchObject({
      documentId: v1,
      submissionId: (await db.document.findUniqueOrThrow({ where: { id: v1 } }))
        .submissionId,
      onBehalf: false,
    });
    // Investors now see it.
    const visible = await db.project.findFirst({
      where: { AND: [{ id: projectId }, projectWhere(v.investor)] },
    });
    expect(visible).not.toBeNull();
    expect(await refusal(publishProject(v.focalA, projectId, opts))).toBe(
      "already_published",
    );
  });

  it("stops a member changing a published project", async () => {
    expect(
      await refusal(
        updateProject(v.memberA, projectId, input("Member edit"), opts),
      ),
    ).toBe("forbidden");
    expect(
      await refusal(
        uploadTeaser(v.memberA, projectId, pdf("m"), view, consent, opts),
      ),
    ).toBe("forbidden");
    expect(await refusal(withdrawProject(v.memberA, projectId, opts))).toBe(
      "forbidden",
    );
  });

  it("gives every new version its own Submission and keeps a linear chain", async () => {
    expect(
      await refusal(
        uploadTeaser(
          v.focalA,
          projectId,
          pdf("v2"),
          view,
          { acknowledged: false },
          opts,
        ),
      ),
    ).toBe("ack_required");
    v2 = await uploadTeaser(
      v.focalA,
      projectId,
      pdf("v2"),
      view,
      consent,
      opts,
    );
    const [doc1, doc2] = await Promise.all([
      db.document.findUniqueOrThrow({ where: { id: v1 } }),
      db.document.findUniqueOrThrow({
        where: { id: v2 },
        include: { submission: true },
      }),
    ]);
    expect(doc2.version).toBe(2);
    expect(doc1.supersededById).toBe(v2);
    expect(doc2.supersededById).toBeNull();
    expect(doc2.submissionId).not.toBe(doc1.submissionId);
    expect(doc2.submission).toMatchObject({
      countryId: C.a,
      uploaderEmail: email.focalA,
      ackTextVersion: appConfig.uploadAcknowledgement.version,
    });
    // The pipeline shows only the new version.
    const investorDocs = await db.document.findMany({
      where: {
        AND: [{ projectId }, documentWhere(v.investor, new Date())],
      },
      select: { id: true },
    });
    expect(investorDocs.map((d) => d.id)).toEqual([v2]);
  });

  it("serves the files only through the policy module", async () => {
    const file = await authorizeDocumentFile(v.focalA, v2, "download", {
      meta,
    });
    const stored = await store.get(file.blobKey);
    const bytes = new Uint8Array(
      await new Response(stored!.stream).arrayBuffer(),
    );
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(file.sha256);
    // An old version is not in the pipeline; the download flag of v2 is off.
    await expect(
      authorizeDocumentFile(v.investor, v1, "view", { meta }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      authorizeDocumentFile(v.investor, v2, "download", { meta }),
    ).rejects.toBeInstanceOf(AuthzError);
  });

  it("changes the download flag for the own country only", async () => {
    expect(await refusal(setTeaserDownload(v.focalB, v2, true, opts))).toBe(
      "not_found",
    );
    expect(await refusal(setTeaserDownload(v.investor, v2, true, opts))).toBe(
      "not_found",
    );
    expect(await refusal(setTeaserDownload(v.memberA, v2, true, opts))).toBe(
      "forbidden",
    );
    await setTeaserDownload(v.focalA, v2, true, opts);
    expect(
      (await db.document.findUniqueOrThrow({ where: { id: v2 } }))
        .allowDownload,
    ).toBe(true);
    expect(await auditActions(v2)).toContain("document.update");
    await authorizeDocumentFile(v.investor, v2, "download", { meta });
  });

  it("withdraws, and the project leaves the pipeline", async () => {
    expect(await refusal(withdrawProject(v.focalB, projectId, opts))).toBe(
      "not_found",
    );
    await withdrawProject(v.focalA, projectId, opts);
    const project = await db.project.findUniqueOrThrow({
      where: { id: projectId },
    });
    expect(project.status).toBe(ProjectStatus.WITHDRAWN);
    expect(
      await db.project.findFirst({
        where: { AND: [{ id: projectId }, projectWhere(v.investor)] },
      }),
    ).toBeNull();
    expect(await refusal(withdrawProject(v.focalA, projectId, opts))).toBe(
      "not_published",
    );
    expect(await auditActions(projectId)).toContain("project.withdraw");
  });

  it("lets an admin upload for the country, recording the on-behalf consent wording", async () => {
    const v3 = await uploadTeaser(
      v.admin,
      projectId,
      pdf("v3"),
      view,
      consent,
      opts,
    );
    const doc = await db.document.findUniqueOrThrow({
      where: { id: v3 },
      include: { submission: true },
    });
    expect(doc.uploadedById).toBe(v.admin.id);
    expect(doc.submission).toMatchObject({
      countryId: C.a,
      uploadLinkId: null,
      uploaderEmail: email.admin,
      ackTextVersion: appConfig.uploadAcknowledgementOnBehalf.version,
    });
    const audit = await db.auditEvent.findFirstOrThrow({
      where: { entityId: doc.submissionId, action: "submission.create" },
    });
    expect(audit.actorId).toBe(v.admin.id);
    expect(audit.metadata).toMatchObject({
      source: "workspace",
      onBehalf: true,
    });
  });

  it("lets an admin publish on behalf of the country", async () => {
    await publishProject(v.admin, projectId, opts);
    expect(
      (await db.project.findUniqueOrThrow({ where: { id: projectId } })).status,
    ).toBe(ProjectStatus.PUBLISHED);
    const publish = await db.auditEvent.findFirstOrThrow({
      where: {
        entityId: projectId,
        action: "project.publish",
        actorId: v.admin.id,
      },
    });
    expect(publish.metadata).toMatchObject({ onBehalf: true, version: 3 });
  });

  it("cannot publish while the only teaser waits for its virus check", async () => {
    const id = await createProject(v.focalA, C.a, input("Pending scan"), opts);
    expect(await refusal(publishProject(v.focalA, id, opts))).toBe(
      "no_clean_teaser",
    );
    const doc = await uploadTeaser(v.focalA, id, pdf("p"), view, consent, {
      ...opts,
      scanMode: "pending",
    });
    expect(
      (await db.document.findUniqueOrThrow({ where: { id: doc } })).scanStatus,
    ).toBe(ScanStatus.PENDING);
    expect(await refusal(publishProject(v.focalA, id, opts))).toBe(
      "no_clean_teaser",
    );
    await expect(
      authorizeDocumentFile(v.focalA, doc, "view", { meta }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});
