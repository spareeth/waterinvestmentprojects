import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import {
  DocumentKind,
  ProjectStatus,
  ScanStatus,
} from "@/generated/prisma/enums";
import { type RequestMeta, writeAudit } from "@/lib/audit";
import {
  AUTHZ_AUDIT,
  actsOnBehalf,
  auditAccess,
  canCreateProject,
  canEditProject,
  canPublishProject,
  canUploadDocument,
  canWithdrawProject,
  findWorkspaceProjectFor,
  publishBlocker,
  type Viewer,
  workspaceCountryWhere,
  workspacePermissions,
  workspaceProjectWhere,
} from "@/lib/authz";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { type BlobStore, getBlobStore, teaserBlobKey } from "@/lib/storage";
import { initialScan, type ScanMode } from "@/lib/storage/scan";
import { requestScanSweep } from "@/lib/storage/scanner";
import { workspaceUploadAcknowledgement } from "./acknowledgement";
import { WorkspaceError } from "./errors";
import type { ProjectInput } from "./project-input";
import { cleanFilename, isPdfFilename, teaserFileProblem } from "./teaser-file";

// Country workspace (M5, PLAN F3/F4; v0.3 since M1): create and edit projects, upload teaser versions, publish
// and withdraw. Every function takes the Viewer from requireViewer() and checks it through src/lib/authz; every
// write and its AuditEvent happen in one transaction. Server actions are thin wrappers around these functions,
// and the integration tests call them directly.
//
// PLAN v0.3 / CLAUDE.md: a teaser cannot be stored without a Submission carrying the acknowledgement text version
// and timestamp. Each workspace upload therefore needs the consent tick and creates its own Submission (no upload
// link, the signed-in user as uploader), which the new Document points at (Document.submissionId).

export const WORKSPACE_AUDIT = {
  PROJECT_CREATE: "project.create",
  PROJECT_UPDATE: "project.update",
  PROJECT_PUBLISH: "project.publish",
  PROJECT_WITHDRAW: "project.withdraw",
  DOCUMENT_UPLOAD: "document.upload",
  DOCUMENT_SCAN: "document.scan",
  DOCUMENT_UPDATE: "document.update",
  SUBMISSION_CREATE: "submission.create",
} as const;

export { WorkspaceError, type WorkspaceErrorCode } from "./errors";

export interface WorkspaceOptions {
  meta?: RequestMeta;
  now?: Date;
  /** Defaults to the configured store (STORAGE_DRIVER). Tests pass a store in a temporary folder. */
  store?: BlobStore;
  /** Defaults to UPLOAD_SCAN. */
  scanMode?: ScanMode;
}

/** The consent tick on the workspace upload form. */
export interface AcknowledgementInput {
  acknowledged: boolean;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

const TEASER_SELECT = {
  id: true,
  filename: true,
  version: true,
  allowDownload: true,
  sha256: true,
  sizeBytes: true,
  scanStatus: true,
  uploadedAt: true,
  supersededById: true,
  uploadedBy: { select: { name: true } },
  submission: {
    select: {
      id: true,
      uploaderName: true,
      ackTextVersion: true,
      ackAcceptedAt: true,
      uploadLinkId: true,
    },
  },
} satisfies Prisma.DocumentSelect;

/** "My projects": the viewer's workspace projects with their latest teaser version. */
export async function listWorkspaceProjects(viewer: Viewer) {
  return db.project.findMany({
    where: workspaceProjectWhere(viewer),
    orderBy: [{ country: { name: "asc" } }, { updatedAt: "desc" }],
    select: {
      id: true,
      title: true,
      sector: true,
      status: true,
      publishedAt: true,
      updatedAt: true,
      country: { select: { id: true, name: true } },
      documents: {
        where: { kind: DocumentKind.TEASER },
        orderBy: { version: "desc" },
        take: 1,
        select: {
          version: true,
          scanStatus: true,
          allowDownload: true,
        },
      },
    },
  });
}

/** Countries the viewer may add a project for (one for most country users). */
export async function listWorkspaceCountries(viewer: Viewer) {
  return db.country.findMany({
    where: workspaceCountryWhere(viewer),
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

/**
 * One workspace project with its teaser versions (each with the Submission that records its consent) and what
 * the viewer may do. Null when the project is not in the viewer's workspace. Records a project.view audit event.
 */
export async function getWorkspaceProject(
  viewer: Viewer,
  projectId: string,
  { meta }: WorkspaceOptions = {},
) {
  const project = await findWorkspaceProjectFor(viewer, projectId);
  if (!project) return null;
  const teasers = await db.document.findMany({
    where: { projectId, kind: DocumentKind.TEASER },
    orderBy: { version: "desc" },
    select: TEASER_SELECT,
  });
  await auditAccess(viewer, {
    action: AUTHZ_AUDIT.PROJECT_VIEW,
    entityType: "Project",
    entityId: project.id,
    meta,
    metadata: { area: "workspace" },
  });
  const current = teasers.find((t) => t.supersededById === null) ?? null;
  const blocker = await publishBlocker(viewer, projectId);
  return {
    project,
    teasers,
    currentTeaser: current,
    permissions: workspacePermissions(viewer, project),
    /** Why publishing would fail right now, or null. */
    publishBlocker: blocker,
  };
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

function projectData(input: ProjectInput) {
  return {
    title: input.title,
    sector: input.sector,
    region: input.region,
    projectType: input.projectType,
    pppModel: input.pppModel,
    sizeMinUsd: input.sizeMinUsd,
    sizeMaxUsd: input.sizeMaxUsd,
    developmentStage: input.developmentStage,
  };
}

/** Adds a DRAFT project to a country the viewer may add projects for. Returns the new id. */
export async function createProject(
  viewer: Viewer,
  countryId: string,
  input: ProjectInput,
  { meta }: WorkspaceOptions = {},
): Promise<string> {
  if (!canCreateProject(viewer)) {
    throw new WorkspaceError("forbidden");
  }
  return db.$transaction(async (tx) => {
    const country = await tx.country.findFirst({
      where: { AND: [{ id: countryId }, workspaceCountryWhere(viewer)] },
      select: { id: true },
    });
    if (!country) throw new WorkspaceError("not_found");
    const project = await tx.project.create({
      data: { ...projectData(input), countryId, status: ProjectStatus.DRAFT },
      select: { id: true },
    });
    await writeAudit(
      {
        actorId: viewer.id,
        action: WORKSPACE_AUDIT.PROJECT_CREATE,
        entityType: "Project",
        entityId: project.id,
        meta,
        metadata: {
          countryId,
          title: input.title,
          onBehalf: actsOnBehalf(viewer, countryId),
        },
      },
      tx,
    );
    return project.id;
  });
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === null || b === null) return a === b;
  return String(a) === String(b);
}

/** Saves the key fields. Members may only change DRAFT projects. Returns the names of the changed fields. */
export async function updateProject(
  viewer: Viewer,
  projectId: string,
  input: ProjectInput,
  { meta }: WorkspaceOptions = {},
): Promise<string[]> {
  return db.$transaction(async (tx) => {
    const project = await findWorkspaceProjectFor(viewer, projectId, {
      client: tx,
    });
    if (!project) throw new WorkspaceError("not_found");
    if (!canEditProject(viewer)) {
      throw new WorkspaceError("forbidden");
    }
    const data = projectData(input);
    const changed = (Object.keys(data) as (keyof typeof data)[]).filter(
      (key) => !sameValue(project[key], data[key]),
    );
    if (changed.length === 0) return [];
    // Guard against the status changing in between (a member's edit racing a publish).
    const updated = await tx.project.updateMany({
      where: { id: projectId, status: project.status },
      data,
    });
    if (updated.count !== 1) throw new WorkspaceError("conflict");
    await writeAudit(
      {
        actorId: viewer.id,
        action: WORKSPACE_AUDIT.PROJECT_UPDATE,
        entityType: "Project",
        entityId: projectId,
        meta,
        metadata: {
          changed,
          status: project.status,
          onBehalf: actsOnBehalf(viewer, project.countryId),
        },
      },
      tx,
    );
    return changed;
  });
}

// ---------------------------------------------------------------------------
// Teasers
// ---------------------------------------------------------------------------

export interface TeaserUpload {
  /** The name the browser sent (display and download name only). */
  name: string;
  bytes: Uint8Array;
}

export interface TeaserFields {
  allowDownload: boolean;
}

/**
 * Stores a new teaser version: PDF only, max 25 MB, sha256, version = latest + 1, and the previous current
 * version is superseded (linear supersededById chain). Scan status starts as UPLOAD_SCAN says. The consent tick
 * is required on every upload: in the same transaction a Submission is created (no link; uploader = the signed-in
 * user; wording version and time from config) and the new Document points at it. Returns the new document id.
 */
export async function uploadTeaser(
  viewer: Viewer,
  projectId: string,
  file: TeaserUpload,
  fields: TeaserFields,
  ack: AcknowledgementInput | null,
  { meta, store, scanMode, now = new Date() }: WorkspaceOptions = {},
): Promise<string> {
  // Permission first, so nothing is written to storage for someone who may not upload.
  const before = await findWorkspaceProjectFor(viewer, projectId);
  if (!before) throw new WorkspaceError("not_found");
  if (!canUploadDocument(viewer)) {
    throw new WorkspaceError("forbidden");
  }
  const problem = teaserFileProblem(file);
  if (problem) throw new WorkspaceError(problem);
  if (!ack?.acknowledged) throw new WorkspaceError("ack_required");

  const blobs = store ?? getBlobStore();
  const mode = scanMode ?? getEnv().UPLOAD_SCAN;
  const scan = initialScan(mode);
  const sha256 = createHash("sha256").update(file.bytes).digest("hex");
  const filename = cleanFilename(file.name);
  const blobKey = teaserBlobKey(projectId, randomUUID());
  await blobs.put(blobKey, file.bytes);

  try {
    const documentId = await db.$transaction(async (tx) => {
      const project = await findWorkspaceProjectFor(viewer, projectId, {
        client: tx,
      });
      if (!project) throw new WorkspaceError("not_found");
      if (!canUploadDocument(viewer)) {
        throw new WorkspaceError("forbidden");
      }
      const uploader = await tx.user.findUnique({
        where: { id: viewer.id },
        select: { name: true, email: true },
      });
      if (!uploader) throw new WorkspaceError("forbidden");
      const onBehalf = actsOnBehalf(viewer, project.countryId);
      const consent = workspaceUploadAcknowledgement(onBehalf);

      const submission = await tx.submission.create({
        data: {
          countryId: project.countryId,
          uploadLinkId: null,
          uploaderName: uploader.name,
          uploaderEmail: uploader.email,
          ackTextVersion: consent.version,
          ackAcceptedAt: now,
          ip: meta?.ip ?? null,
        },
        select: { id: true },
      });

      const previous = await tx.document.findFirst({
        where: { projectId, kind: DocumentKind.TEASER },
        orderBy: { version: "desc" },
        select: { id: true, version: true, supersededById: true },
      });
      const version = (previous?.version ?? 0) + 1;
      const doc = await tx.document.create({
        data: {
          projectId,
          submissionId: submission.id,
          kind: DocumentKind.TEASER,
          filename,
          version,
          allowDownload: fields.allowDownload,
          blobKey,
          sha256,
          sizeBytes: file.bytes.byteLength,
          scanStatus: scan.scanStatus,
          uploadedById: viewer.id,
        },
        select: { id: true, version: true },
      });
      // The chain is linear: the latest version always supersedes the one before it.
      const superseded =
        previous && previous.supersededById === null ? previous.id : null;
      if (superseded) {
        await tx.document.update({
          where: { id: superseded },
          data: { supersededById: doc.id },
        });
      }
      await writeAudit(
        {
          actorId: viewer.id,
          action: WORKSPACE_AUDIT.SUBMISSION_CREATE,
          entityType: "Submission",
          entityId: submission.id,
          meta,
          metadata: {
            countryId: project.countryId,
            source: "workspace",
            uploaderName: uploader.name,
            uploaderEmail: uploader.email,
            ackTextVersion: consent.version,
            ackAcceptedAt: now.toISOString(),
            onBehalf,
            projectId,
            documentIds: [doc.id],
          },
        },
        tx,
      );
      await writeAudit(
        {
          actorId: viewer.id,
          action: WORKSPACE_AUDIT.DOCUMENT_UPLOAD,
          entityType: "Document",
          entityId: doc.id,
          meta,
          metadata: {
            projectId,
            submissionId: submission.id,
            kind: DocumentKind.TEASER,
            version,
            filename,
            sha256,
            sizeBytes: file.bytes.byteLength,
            allowDownload: fields.allowDownload,
            supersedes: superseded,
            onBehalf,
            source: "workspace",
          },
        },
        tx,
      );
      await writeAudit(
        {
          actorId: null,
          action: WORKSPACE_AUDIT.DOCUMENT_SCAN,
          entityType: "Document",
          entityId: doc.id,
          meta,
          metadata: { scanStatus: scan.scanStatus, scanner: scan.scanner },
        },
        tx,
      );
      return doc.id;
    });
    // Committed: hand the file to the virus scanner now (UPLOAD_SCAN=clamav) without waiting for it.
    if (mode === "clamav") requestScanSweep();
    return documentId;
  } catch (error) {
    // Nothing points at the file any more: remove it so storage holds no orphans.
    await blobs.delete(blobKey).catch(() => undefined);
    throw error;
  }
}

/** Switches downloading on or off for one teaser version (PLAN v0.3: allowed by default). */
export async function setTeaserDownload(
  viewer: Viewer,
  documentId: string,
  allowDownload: boolean,
  { meta }: WorkspaceOptions = {},
): Promise<void> {
  await db.$transaction(async (tx) => {
    const doc = await tx.document.findFirst({
      where: {
        id: documentId,
        kind: DocumentKind.TEASER,
        project: workspaceProjectWhere(viewer),
      },
      select: {
        id: true,
        allowDownload: true,
        project: { select: { id: true, countryId: true, status: true } },
      },
    });
    if (!doc) throw new WorkspaceError("not_found");
    if (!canUploadDocument(viewer)) {
      throw new WorkspaceError("forbidden");
    }
    if (doc.allowDownload === allowDownload) return;
    await tx.document.update({
      where: { id: doc.id },
      data: { allowDownload },
    });
    await writeAudit(
      {
        actorId: viewer.id,
        action: WORKSPACE_AUDIT.DOCUMENT_UPDATE,
        entityType: "Document",
        entityId: doc.id,
        meta,
        metadata: { projectId: doc.project.id, allowDownload },
      },
      tx,
    );
  });
}

// ---------------------------------------------------------------------------
// Publish and withdraw
// ---------------------------------------------------------------------------

/**
 * Publishes to the pipeline. PLAN v0.3: the consent was given at upload (every teaser has a Submission), so
 * publishing needs no further tick. In one transaction: applies the download choice, asks publishBlocker() (a
 * current CLEAN teaser) and only then sets PUBLISHED.
 */
export async function publishProject(
  viewer: Viewer,
  projectId: string,
  options: { allowDownload?: boolean } & WorkspaceOptions = {},
): Promise<void> {
  const { meta, now = new Date() } = options;
  await db.$transaction(async (tx) => {
    const project = await findWorkspaceProjectFor(viewer, projectId, {
      client: tx,
    });
    if (!project) throw new WorkspaceError("not_found");
    if (!canPublishProject(viewer, project)) {
      throw new WorkspaceError(
        project.status === ProjectStatus.PUBLISHED &&
          canWithdrawProject(viewer, project)
          ? "already_published"
          : "forbidden",
      );
    }
    const teaser = await tx.document.findFirst({
      where: {
        projectId,
        kind: DocumentKind.TEASER,
        supersededById: null,
        scanStatus: ScanStatus.CLEAN,
      },
      orderBy: { version: "desc" },
      select: {
        id: true,
        filename: true,
        version: true,
        allowDownload: true,
        submissionId: true,
      },
    });
    if (!teaser) throw new WorkspaceError("no_clean_teaser");
    if (!isPdfFilename(teaser.filename)) {
      throw new WorkspaceError("teaser_not_pdf");
    }
    if (
      options.allowDownload !== undefined &&
      options.allowDownload !== teaser.allowDownload
    ) {
      await tx.document.update({
        where: { id: teaser.id },
        data: { allowDownload: options.allowDownload },
      });
      await writeAudit(
        {
          actorId: viewer.id,
          action: WORKSPACE_AUDIT.DOCUMENT_UPDATE,
          entityType: "Document",
          entityId: teaser.id,
          meta,
          metadata: { projectId, allowDownload: options.allowDownload },
        },
        tx,
      );
    }
    // The policy module has the last word.
    const blocker = await publishBlocker(viewer, projectId, { client: tx });
    if (blocker) throw new WorkspaceError(blocker);
    const updated = await tx.project.updateMany({
      where: { id: projectId, status: { not: ProjectStatus.PUBLISHED } },
      data: { status: ProjectStatus.PUBLISHED, publishedAt: now },
    });
    if (updated.count !== 1) throw new WorkspaceError("conflict");
    await writeAudit(
      {
        actorId: viewer.id,
        action: WORKSPACE_AUDIT.PROJECT_PUBLISH,
        entityType: "Project",
        entityId: projectId,
        meta,
        metadata: {
          previousStatus: project.status,
          documentId: teaser.id,
          version: teaser.version,
          submissionId: teaser.submissionId,
          onBehalf: actsOnBehalf(viewer, project.countryId),
        },
      },
      tx,
    );
  });
}

/** Takes a published project out of the pipeline (status WITHDRAWN). It can be published again later. */
export async function withdrawProject(
  viewer: Viewer,
  projectId: string,
  { meta }: WorkspaceOptions = {},
): Promise<void> {
  await db.$transaction(async (tx) => {
    const project = await findWorkspaceProjectFor(viewer, projectId, {
      client: tx,
    });
    if (!project) throw new WorkspaceError("not_found");
    if (!canWithdrawProject(viewer, project)) {
      throw new WorkspaceError(
        project.status !== ProjectStatus.PUBLISHED &&
          canPublishProject(viewer, project)
          ? "not_published"
          : "forbidden",
      );
    }
    const updated = await tx.project.updateMany({
      where: { id: projectId, status: ProjectStatus.PUBLISHED },
      data: { status: ProjectStatus.WITHDRAWN },
    });
    if (updated.count !== 1) throw new WorkspaceError("conflict");
    await writeAudit(
      {
        actorId: viewer.id,
        action: WORKSPACE_AUDIT.PROJECT_WITHDRAW,
        entityType: "Project",
        entityId: projectId,
        meta,
        metadata: { onBehalf: actsOnBehalf(viewer, project.countryId) },
      },
      tx,
    );
  });
}
