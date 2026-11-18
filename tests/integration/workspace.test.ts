// M5: the country workspace service against real PostgreSQL. Proves that every action goes through the policy
// module (cross-country and cross-project isolation, member versus focal point versus admin on behalf), that
// publishing is impossible without a stored Acknowledgement on the current clean teaser, that teaser versions form
// a linear supersededById chain, and that each write leaves its AuditEvent.

import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  MembershipRole,
  PipelineScope,
  ProjectStatus,
  ProjectTier,
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
import { db } from "@/lib/db";
import { LocalBlobStore } from "@/lib/storage";
import {
  ACKNOWLEDGEMENT_ON_BEHALF_TEXT_VERSION,
  ACKNOWLEDGEMENT_TEXT_VERSION,
} from "@/lib/workspace/acknowledgement";
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

const input = (name: string): ProjectInput => ({
  name,
  sector: "Desalination",
  tier: ProjectTier.TIER1,
  projectType: ProjectType.SUMMIT_PIPELINE,
  pppModel: null,
  sizeMinUsd: "10000000",
  sizeMaxUsd: "20000000",
  tenderTimeline: null,
  documentsPrepared: null,
  feedbackSought: null,
  revenueModel: null,
  counterparty: null,
  lat: null,
  lon: null,
});

const pdf = (label: string) => ({
  name: `${label}.pdf`,
  bytes: new TextEncoder().encode(`%PDF-1.7\n% ${label}\n%%EOF\n`),
});
const view = { allowDownload: false };

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
    return (await viewerFor(u.id))!;
  };
  v.admin = await make(UserRole.SUMMIT_ADMIN);
  v.focalA = await make(UserRole.COUNTRY, MembershipRole.FOCAL_POINT, C.a);
  v.memberA = await make(UserRole.COUNTRY, MembershipRole.MEMBER, C.a);
  // Country B's focal point also sees the whole pipeline, which must not open A's workspace.
  v.focalB = await make(
    UserRole.COUNTRY,
    MembershipRole.FOCAL_POINT,
    C.b,
    PipelineScope.ALL,
  );
  v.investor = await make(
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

  it("updates key fields and records which ones changed", async () => {
    const changed = await updateProject(
      v.memberA,
      projectId,
      { ...input("Workspace one, renamed"), counterparty: "Fictional Utility" },
      opts,
    );
    expect(changed.sort()).toEqual(["counterparty", "name"]);
    expect(
      await updateProject(
        v.memberA,
        projectId,
        {
          ...input("Workspace one, renamed"),
          counterparty: "Fictional Utility",
        },
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

  it("stores a teaser version with sha256, scan status and audit, and refuses bad files", async () => {
    const file = pdf("v1");
    v1 = await uploadTeaser(v.memberA, projectId, file, view, null, opts);
    const doc = await db.document.findUniqueOrThrow({ where: { id: v1 } });
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
    expect(doc.blobKey).toMatch(new RegExp(`^projects/${projectId}/teaser/`));
    expect(await store.get(doc.blobKey)).not.toBeNull();
    expect(await auditActions(v1)).toEqual([
      "document.upload",
      "document.scan",
    ]);

    const before = await blobCount();
    expect(
      await refusal(
        uploadTeaser(
          v.memberA,
          projectId,
          { name: "deck.pptx", bytes: file.bytes },
          view,
          null,
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
          null,
          opts,
        ),
      ),
    ).toBe("file_not_pdf");
    expect(
      await refusal(
        uploadTeaser(v.focalB, projectId, pdf("x"), view, null, opts),
      ),
    ).toBe("not_found");
    expect(
      await refusal(
        uploadTeaser(v.investor, projectId, pdf("x"), view, null, opts),
      ),
    ).toBe("not_found");
    // Refused uploads never reach storage.
    expect(await blobCount()).toBe(before);
  });

  it("does not let a member publish, and needs the tick from the focal point", async () => {
    expect(
      await refusal(
        publishProject(v.memberA, projectId, { acknowledged: true }, opts),
      ),
    ).toBe("forbidden");
    expect(
      await refusal(
        publishProject(v.focalB, projectId, { acknowledged: true }, opts),
      ),
    ).toBe("not_found");
    expect(
      await refusal(
        publishProject(v.focalA, projectId, { acknowledged: false }, opts),
      ),
    ).toBe("ack_required");
    expect(await db.acknowledgement.count({ where: { projectId } })).toBe(0);
    expect(
      (await db.project.findUniqueOrThrow({ where: { id: projectId } })).status,
    ).toBe(ProjectStatus.DRAFT);
  });

  it("publishes with a stored acknowledgement on the current clean teaser", async () => {
    await publishProject(
      v.focalA,
      projectId,
      { acknowledged: true },
      { ...opts, allowDownload: true },
    );
    const project = await db.project.findUniqueOrThrow({
      where: { id: projectId },
    });
    expect(project.status).toBe(ProjectStatus.PUBLISHED);
    expect(project.publishedAt).not.toBeNull();
    const ack = await db.acknowledgement.findFirstOrThrow({
      where: { projectId },
    });
    expect(ack).toMatchObject({
      documentId: v1,
      userId: v.focalA.id,
      textVersion: ACKNOWLEDGEMENT_TEXT_VERSION,
      onBehalfOfCountry: false,
      evidenceNote: null,
      ip: meta.ip,
    });
    expect(
      (await db.document.findUniqueOrThrow({ where: { id: v1 } }))
        .allowDownload,
    ).toBe(true);
    expect(await auditActions(projectId)).toContain("project.publish");
    expect(await auditActions(ack.id)).toEqual(["acknowledgement.create"]);
    // Investors now see it.
    const visible = await db.project.findFirst({
      where: { AND: [{ id: projectId }, projectWhere(v.investor)] },
    });
    expect(visible).not.toBeNull();
    expect(
      await refusal(
        publishProject(v.focalA, projectId, { acknowledged: true }, opts),
      ),
    ).toBe("already_published");
  });

  it("stops a member changing a published project", async () => {
    expect(
      await refusal(
        updateProject(v.memberA, projectId, input("Member edit"), opts),
      ),
    ).toBe("forbidden");
    expect(
      await refusal(
        uploadTeaser(v.memberA, projectId, pdf("m"), view, null, opts),
      ),
    ).toBe("forbidden");
    expect(await refusal(withdrawProject(v.memberA, projectId, opts))).toBe(
      "forbidden",
    );
  });

  it("needs the tick again when a new version replaces the live teaser", async () => {
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
      { acknowledged: true },
      opts,
    );
    const [doc1, doc2] = await Promise.all([
      db.document.findUniqueOrThrow({ where: { id: v1 } }),
      db.document.findUniqueOrThrow({ where: { id: v2 } }),
    ]);
    expect(doc2.version).toBe(2);
    expect(doc1.supersededById).toBe(v2);
    expect(doc2.supersededById).toBeNull();
    expect(
      await db.acknowledgement.count({ where: { projectId, documentId: v2 } }),
    ).toBe(1);
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

  it("lets an admin publish on behalf of the country only with an evidence note", async () => {
    const acksBefore = await db.acknowledgement.count({ where: { projectId } });
    expect(
      await refusal(
        publishProject(v.admin, projectId, { acknowledged: true }, opts),
      ),
    ).toBe("evidence_required");
    expect(
      await refusal(
        publishProject(
          v.admin,
          projectId,
          { acknowledged: true, evidenceNote: "short" },
          opts,
        ),
      ),
    ).toBe("evidence_required");
    // A refused publish leaves nothing behind.
    expect(await db.acknowledgement.count({ where: { projectId } })).toBe(
      acksBefore,
    );
    await publishProject(
      v.admin,
      projectId,
      {
        acknowledged: true,
        evidenceNote: "Email from the focal point, 18 Nov 2026, Summit mailbox",
      },
      opts,
    );
    const ack = await db.acknowledgement.findFirstOrThrow({
      where: { projectId, userId: v.admin.id },
    });
    expect(ack).toMatchObject({
      documentId: v2,
      onBehalfOfCountry: true,
      textVersion: ACKNOWLEDGEMENT_ON_BEHALF_TEXT_VERSION,
      evidenceNote: "Email from the focal point, 18 Nov 2026, Summit mailbox",
    });
    const publish = await db.auditEvent.findFirstOrThrow({
      where: {
        entityId: projectId,
        action: "project.publish",
        actorId: v.admin.id,
      },
    });
    expect(publish.metadata).toMatchObject({ onBehalf: true, version: 2 });
  });

  it("cannot publish while the only teaser waits for its virus check", async () => {
    const id = await createProject(v.focalA, C.a, input("Pending scan"), opts);
    expect(
      await refusal(publishProject(v.focalA, id, { acknowledged: true }, opts)),
    ).toBe("no_clean_teaser");
    const doc = await uploadTeaser(v.focalA, id, pdf("p"), view, null, {
      ...opts,
      scanMode: "pending",
    });
    expect(
      (await db.document.findUniqueOrThrow({ where: { id: doc } })).scanStatus,
    ).toBe(ScanStatus.PENDING);
    expect(
      await refusal(publishProject(v.focalA, id, { acknowledged: true }, opts)),
    ).toBe("no_clean_teaser");
    await expect(
      authorizeDocumentFile(v.focalA, doc, "view", { meta }),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(await db.acknowledgement.count({ where: { projectId: id } })).toBe(
      0,
    );
  });
});
