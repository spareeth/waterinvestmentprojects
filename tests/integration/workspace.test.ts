// The country workspace service against real PostgreSQL, for PLAN v0.3 (M1 data model, M3 roles). Proves that
// every action goes through the policy module: country users only read their own country's projects, admins
// create, edit, upload, publish and withdraw on the country's behalf (cross-country and cross-project isolation
// included); that no teaser is stored without a Submission carrying the consent wording version and time; that
// publishing needs a current clean teaser; that teaser versions form a linear supersededById chain; and that
// each write leaves its AuditEvent.

import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  MembershipRole,
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
  region: null,
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
  ) => {
    const u = await createUser({
      role,
      membershipRole,
      countryId,
      termsAccepted: true,
      mfaEnabled: true,
    });
    if (role === UserRole.INVESTOR) {
      await db.user.update({
        where: { id: u.id },
        data: {
          investorAckTextVersion: appConfig.investorAcknowledgement.version,
          investorAckAcceptedAt: new Date(),
        },
      });
    }
    v[key] = (await viewerFor(u.id))!;
    email[key] = u.email;
  };
  await make("admin", UserRole.SUMMIT_ADMIN);
  await make("focalA", UserRole.COUNTRY, MembershipRole.FOCAL_POINT, C.a);
  await make("memberA", UserRole.COUNTRY, MembershipRole.MEMBER, C.a);
  await make("focalB", UserRole.COUNTRY, MembershipRole.FOCAL_POINT, C.b);
  await make("investor", UserRole.INVESTOR);
});

afterAll(async () => {
  await cleanUp();
  await rm(blobDir, { recursive: true, force: true });
});

describe("country workspace", () => {
  let projectId: string;
  let v1: string;
  let v2: string;

  it("lets only admins create a draft (countries submit through the upload link)", async () => {
    for (const who of ["focalA", "memberA", "focalB", "investor"] as const) {
      expect(
        await refusal(createProject(v[who], C.a, input("x"), opts)),
        who,
      ).toBe("forbidden");
    }
    expect(await db.project.count({ where: { countryId: C.a } })).toBe(0);
    projectId = await createProject(v.admin, C.a, input("Workspace one"), opts);
    const project = await db.project.findUniqueOrThrow({
      where: { id: projectId },
    });
    expect(project.status).toBe(ProjectStatus.DRAFT);
    expect(project.countryId).toBe(C.a);
    expect(project.title).toBe("Workspace one");
    expect(await auditActions(projectId)).toEqual(["project.create"]);
    expect(
      await refusal(createProject(v.admin, "it-ws-missing", input("x"), opts)),
    ).toBe("not_found");
  });

  it("shows the draft to its own country, read only, and to nobody else", async () => {
    expect(await getWorkspaceProject(v.focalB, projectId)).toBeNull();
    expect(await getWorkspaceProject(v.investor, projectId)).toBeNull();
    const listB = await listWorkspaceProjects(v.focalB);
    expect(listB.some((p) => p.country.id === C.a)).toBe(false);
    expect(await listWorkspaceProjects(v.investor)).toEqual([]);
    for (const who of ["focalA", "memberA"] as const) {
      const own = await getWorkspaceProject(v[who], projectId, opts);
      expect(own?.permissions, who).toEqual({
        edit: false,
        uploadTeaser: false,
        publish: false,
        withdraw: false,
        // 23 Nov: a country user may delete their own country's draft.
        delete: true,
        onBehalf: false,
      });
    }
    expect(
      (await getWorkspaceProject(v.admin, projectId, opts))?.permissions,
    ).toMatchObject({ edit: true, uploadTeaser: true, onBehalf: true });
  });

  it("lets only admins update key fields, and records which ones changed", async () => {
    expect(
      await refusal(updateProject(v.focalA, projectId, input("Edit"), opts)),
    ).toBe("forbidden");
    expect(
      await refusal(updateProject(v.focalB, projectId, input("Hijack"), opts)),
    ).toBe("not_found");
    expect(
      await refusal(
        updateProject(v.investor, projectId, input("Hijack"), opts),
      ),
    ).toBe("not_found");
    const changed = await updateProject(
      v.admin,
      projectId,
      { ...input("Workspace one, renamed"), developmentStage: "Feasibility" },
      opts,
    );
    expect(changed.sort()).toEqual(["developmentStage", "title"]);
    expect(
      await updateProject(
        v.admin,
        projectId,
        { ...input("Workspace one, renamed"), developmentStage: "Feasibility" },
        opts,
      ),
    ).toEqual([]);
    const audit = await db.auditEvent.findFirstOrThrow({
      where: { entityId: projectId, action: "project.update" },
    });
    expect(audit.actorId).toBe(v.admin.id);
    expect(audit.metadata).toMatchObject({ changed: expect.any(Array) });
  });

  it("refuses country users', other countries' and investors' uploads, storing nothing", async () => {
    const [blobs, submissions] = [await blobCount(), await submissionCount()];
    for (const who of ["focalA", "memberA"] as const) {
      expect(
        await refusal(
          uploadTeaser(v[who], projectId, pdf("x"), view, consent, opts),
        ),
        who,
      ).toBe("forbidden");
    }
    // Cross-country and investor: the project does not even exist for them.
    for (const who of ["focalB", "investor"] as const) {
      expect(
        await refusal(
          uploadTeaser(v[who], projectId, pdf("x"), view, consent, opts),
        ),
        who,
      ).toBe("not_found");
    }
    expect(await blobCount()).toBe(blobs);
    expect(await submissionCount()).toBe(submissions);
  });

  it("refuses an upload without the consent tick, or a bad file, storing nothing", async () => {
    const [blobs, submissions] = [await blobCount(), await submissionCount()];
    for (const ack of [null, { acknowledged: false }]) {
      expect(
        await refusal(
          uploadTeaser(v.admin, projectId, pdf("v1"), view, ack, opts),
        ),
      ).toBe("ack_required");
    }
    // Every route takes the same formats (22 Nov); a file whose content does not match its name is still refused.
    const file = pdf("bad");
    for (const bad of [
      { name: "deck.pptx", bytes: file.bytes },
      { name: "fake.pdf", bytes: new TextEncoder().encode("hello") },
    ]) {
      expect(
        await refusal(
          uploadTeaser(v.admin, projectId, bad, view, consent, opts),
        ),
      ).toBe("file_wrong_type");
    }
    expect(await blobCount()).toBe(blobs);
    expect(await submissionCount()).toBe(submissions);
    expect(await db.document.count({ where: { projectId } })).toBe(0);
  });

  it("stores an admin's teaser with its own on-behalf Submission (consent version and time), sha256, scan status and audit", async () => {
    const file = pdf("v1");
    const now = new Date("2026-11-19T08:00:00Z");
    v1 = await uploadTeaser(v.admin, projectId, file, view, consent, {
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
      uploadedById: v.admin.id,
    });
    expect(doc.submission).toMatchObject({
      countryId: C.a,
      uploadLinkId: null,
      uploaderName: "Integration Tester",
      uploaderEmail: email.admin,
      ackTextVersion: appConfig.uploadAcknowledgementOnBehalf.version,
      ip: meta.ip,
    });
    expect(doc.submission.ackAcceptedAt.getTime()).toBe(now.getTime());
    // The project keeps no link submission; only link projects carry Project.submissionId.
    expect(
      (await db.project.findUniqueOrThrow({ where: { id: projectId } }))
        .submissionId,
    ).toBeNull();
    // A portal uploader is not made a request-inbox contact.
    expect(await db.countryContact.count({ where: { countryId: C.a } })).toBe(
      0,
    );
    expect(doc.blobKey).toMatch(new RegExp(`^projects/${projectId}/teaser/`));
    expect(await store.get(doc.blobKey)).not.toBeNull();
    expect(await auditActions(v1)).toEqual([
      "document.upload",
      "document.scan",
    ]);
    const submissionAudit = await db.auditEvent.findFirstOrThrow({
      where: { entityId: doc.submissionId, action: "submission.create" },
    });
    expect(submissionAudit.actorId).toBe(v.admin.id);
    expect(submissionAudit.metadata).toMatchObject({
      source: "workspace",
      onBehalf: true,
    });
  });

  it("does not let a country user, another country or an investor publish", async () => {
    for (const who of ["focalA", "memberA"] as const) {
      expect(await refusal(publishProject(v[who], projectId, opts)), who).toBe(
        "forbidden",
      );
    }
    for (const who of ["focalB", "investor"] as const) {
      expect(await refusal(publishProject(v[who], projectId, opts)), who).toBe(
        "not_found",
      );
    }
    expect(
      (await db.project.findUniqueOrThrow({ where: { id: projectId } })).status,
    ).toBe(ProjectStatus.DRAFT);
  });

  it("lets an admin publish the current clean teaser on behalf of the country", async () => {
    await publishProject(v.admin, projectId, {
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
    expect(publish.actorId).toBe(v.admin.id);
    expect(publish.metadata).toMatchObject({
      documentId: v1,
      submissionId: (await db.document.findUniqueOrThrow({ where: { id: v1 } }))
        .submissionId,
      onBehalf: true,
    });
    // Investors now see it, and so does the other country, in its pipeline (M12).
    for (const [who, seen] of [
      ["investor", true],
      ["focalB", true],
    ] as const) {
      const visible = await db.project.findFirst({
        where: { AND: [{ id: projectId }, projectWhere(v[who])] },
      });
      expect(visible !== null, who).toBe(seen);
    }
    expect(await refusal(publishProject(v.admin, projectId, opts))).toBe(
      "already_published",
    );
  });

  it("gives every new version its own Submission and keeps a linear chain", async () => {
    v2 = await uploadTeaser(v.admin, projectId, pdf("v2"), view, consent, opts);
    const [doc1, doc2] = await Promise.all([
      db.document.findUniqueOrThrow({ where: { id: v1 } }),
      db.document.findUniqueOrThrow({ where: { id: v2 } }),
    ]);
    expect(doc2.version).toBe(2);
    expect(doc1.supersededById).toBe(v2);
    expect(doc2.supersededById).toBeNull();
    expect(doc2.submissionId).not.toBe(doc1.submissionId);
    // The pipeline shows only the new version.
    const investorDocs = await db.document.findMany({
      where: { AND: [{ projectId }, documentWhere(v.investor)] },
      select: { id: true },
    });
    expect(investorDocs.map((d) => d.id)).toEqual([v2]);
  });

  it("serves the files only through the policy module", async () => {
    const file = await authorizeDocumentFile(v.memberA, v2, "download", {
      meta,
    });
    const stored = await store.get(file.blobKey);
    const bytes = new Uint8Array(
      await new Response(stored!.stream).arrayBuffer(),
    );
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(file.sha256);
    // An old version is not in the pipeline; the download switch of v2 is off.
    await expect(
      authorizeDocumentFile(v.investor, v1, "view", { meta }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      authorizeDocumentFile(v.investor, v2, "download", { meta }),
    ).rejects.toBeInstanceOf(AuthzError);
    // M12: the other country reads the published teaser like an investor: no old version, no download when off.
    await expect(
      authorizeDocumentFile(v.focalB, v1, "view", { meta }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      authorizeDocumentFile(v.focalB, v2, "download", { meta }),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(
      (await authorizeDocumentFile(v.focalB, v2, "view", { meta })).id,
    ).toBe(v2);
  });

  it("lets only admins change the download switch", async () => {
    for (const [who, code] of [
      ["focalB", "not_found"],
      ["investor", "not_found"],
      ["focalA", "forbidden"],
      ["memberA", "forbidden"],
    ] as const) {
      expect(
        await refusal(setTeaserDownload(v[who], v2, true, opts)),
        who,
      ).toBe(code);
    }
    await setTeaserDownload(v.admin, v2, true, opts);
    expect(
      (await db.document.findUniqueOrThrow({ where: { id: v2 } }))
        .allowDownload,
    ).toBe(true);
    expect(await auditActions(v2)).toContain("document.update");
    await authorizeDocumentFile(v.investor, v2, "download", { meta });
  });

  it("lets only admins withdraw, and the project leaves the pipeline", async () => {
    expect(await refusal(withdrawProject(v.focalA, projectId, opts))).toBe(
      "forbidden",
    );
    expect(await refusal(withdrawProject(v.focalB, projectId, opts))).toBe(
      "not_found",
    );
    await withdrawProject(v.admin, projectId, opts);
    const project = await db.project.findUniqueOrThrow({
      where: { id: projectId },
    });
    expect(project.status).toBe(ProjectStatus.WITHDRAWN);
    expect(
      await db.project.findFirst({
        where: { AND: [{ id: projectId }, projectWhere(v.investor)] },
      }),
    ).toBeNull();
    // Its own country still sees it.
    expect(await getWorkspaceProject(v.focalA, projectId)).not.toBeNull();
    expect(await refusal(withdrawProject(v.admin, projectId, opts))).toBe(
      "not_published",
    );
    expect(await auditActions(projectId)).toContain("project.withdraw");
  });

  it("cannot publish while the only teaser waits for its virus check", async () => {
    const id = await createProject(v.admin, C.a, input("Pending scan"), opts);
    expect(await refusal(publishProject(v.admin, id, opts))).toBe(
      "no_clean_teaser",
    );
    const doc = await uploadTeaser(v.admin, id, pdf("p"), view, consent, {
      ...opts,
      scanMode: "pending",
    });
    expect(
      (await db.document.findUniqueOrThrow({ where: { id: doc } })).scanStatus,
    ).toBe(ScanStatus.PENDING);
    expect(await refusal(publishProject(v.admin, id, opts))).toBe(
      "no_clean_teaser",
    );
    await expect(
      authorizeDocumentFile(v.focalA, doc, "view", { meta }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});
