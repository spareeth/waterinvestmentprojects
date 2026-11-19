import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { DocumentKind, ScanStatus } from "@/generated/prisma/enums";
import type { RequestMeta } from "@/lib/audit";
import { db } from "@/lib/db";
import { AUTHZ_AUDIT, auditAccess } from "./audit";
import {
  canDownloadDocument,
  canOpenDocumentFile,
  canViewDocument,
  documentWhere,
} from "./documents";
import { canPublishProject, projectWhere } from "./projects";
import { meetingRequestWhere } from "./requests";
import { SLOT_POLICY_SELECT, type SlotView, slotView } from "./slots";
import { AuthzError, PROJECT_POLICY_SELECT, type Viewer } from "./viewer";
import { workspaceProjectWhere } from "./workspace";

// Server-side data access through the policy module, for M5 to M7. Each helper takes the Viewer explicitly
// (from requireViewer()) plus an optional client and clock, so integration tests can call it directly.
// A record the viewer may not see comes back as null (or AuthzError "not_found"), never as "forbidden",
// so ids of other countries' drafts or other investors' requests cannot be probed.

export interface DataOptions {
  client?: Prisma.TransactionClient;
  now?: Date;
}

export async function findProjectFor(
  viewer: Viewer | null,
  projectId: string,
  { client = db }: DataOptions = {},
) {
  return client.project.findFirst({
    where: { AND: [{ id: projectId }, projectWhere(viewer)] },
    include: { country: { select: { id: true, name: true, status: true } } },
  });
}

/**
 * A project in the viewer's workspace (own country, or any for admins), or null. Projects a country user only
 * sees through the pipeline are not in their workspace, so they come back as null here.
 */
export async function findWorkspaceProjectFor(
  viewer: Viewer | null,
  projectId: string,
  { client = db }: DataOptions = {},
) {
  return client.project.findFirst({
    where: { AND: [{ id: projectId }, workspaceProjectWhere(viewer)] },
    include: { country: { select: { id: true, name: true, status: true } } },
  });
}

/** Document metadata (never the blob key; files go through authorizeDocumentFile). */
export async function findDocumentFor(
  viewer: Viewer | null,
  documentId: string,
  { client = db }: DataOptions = {},
) {
  return client.document.findFirst({
    where: { AND: [{ id: documentId }, documentWhere(viewer)] },
    omit: { blobKey: true },
    include: { project: { select: PROJECT_POLICY_SELECT } },
  });
}

export async function findMeetingRequestFor(
  viewer: Viewer | null,
  requestId: string,
  { client = db }: DataOptions = {},
) {
  return client.meetingRequest.findFirst({
    where: { AND: [{ id: requestId }, meetingRequestWhere(viewer)] },
    include: {
      project: { select: { id: true, title: true, countryId: true } },
    },
  });
}

export type FileMode = "view" | "download";

/**
 * The only way to get a document's blob key. Checks the viewer may open (or download) the file, writes the
 * audit event (document.view / document.download, or access.denied), and returns what the storage module needs
 * to stream the file or sign a short-lived URL. Throws AuthzError: "not_found" when the viewer may not even
 * see the document, "forbidden" when they see it but may not open or download it (scan pending, download off).
 */
export async function authorizeDocumentFile(
  viewer: Viewer | null,
  documentId: string,
  mode: FileMode,
  { client = db, meta }: DataOptions & { meta?: RequestMeta } = {},
) {
  const doc = await client.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      projectId: true,
      kind: true,
      filename: true,
      version: true,
      allowDownload: true,
      blobKey: true,
      sha256: true,
      sizeBytes: true,
      scanStatus: true,
      supersededById: true,
      project: { select: PROJECT_POLICY_SELECT },
    },
  });
  const check = mode === "download" ? canDownloadDocument : canOpenDocumentFile;

  if (!doc || !check(viewer, doc)) {
    await auditAccess(
      viewer,
      {
        action: AUTHZ_AUDIT.ACCESS_DENIED,
        entityType: "Document",
        entityId: documentId,
        meta,
        metadata: { mode },
      },
      client,
    );
    const visible = doc !== null && canViewDocument(viewer, doc);
    throw new AuthzError(visible ? "forbidden" : "not_found");
  }

  await auditAccess(
    viewer,
    {
      action:
        mode === "download"
          ? AUTHZ_AUDIT.DOCUMENT_DOWNLOAD
          : AUTHZ_AUDIT.DOCUMENT_VIEW,
      entityType: "Document",
      entityId: doc.id,
      meta,
      metadata: {
        projectId: doc.projectId,
        kind: doc.kind,
        version: doc.version,
        scanStatus: doc.scanStatus,
      },
    },
    client,
  );
  return {
    id: doc.id,
    projectId: doc.projectId,
    filename: doc.filename,
    blobKey: doc.blobKey,
    sha256: doc.sha256,
    sizeBytes: doc.sizeBytes,
    allowDownload: doc.allowDownload,
    scanStatus: doc.scanStatus,
  };
}

export type PublishBlocker = "not_found" | "forbidden" | "no_clean_teaser";

/**
 * Why this viewer cannot publish the project now, or null when they can. Needs the publish role (admins, PLAN v0.3)
 * and a current CLEAN teaser. PLAN v0.3: the consent is the teaser's Submission, given at upload; the
 * database guarantees every Document has one (Document.submissionId is required). Call it inside the publishing
 * transaction.
 */
export async function publishBlocker(
  viewer: Viewer | null,
  projectId: string,
  { client = db }: DataOptions = {},
): Promise<PublishBlocker | null> {
  const project = await client.project.findFirst({
    where: { AND: [{ id: projectId }, projectWhere(viewer)] },
    select: { id: true, countryId: true, status: true },
  });
  if (!project) return "not_found";
  if (!canPublishProject(viewer, project)) return "forbidden";
  const teaser = await client.document.findFirst({
    where: {
      projectId,
      kind: DocumentKind.TEASER,
      supersededById: null,
      scanStatus: ScanStatus.CLEAN,
    },
    orderBy: { version: "desc" },
    select: { id: true },
  });
  return teaser ? null : "no_clean_teaser";
}

/** The room grid, redacted for the viewer: other people's bookings show only as BOOKED. */
export async function listSlotsFor(
  viewer: Viewer | null,
  { client = db, from, to }: DataOptions & { from?: Date; to?: Date } = {},
): Promise<SlotView[]> {
  if (!viewer) return [];
  const slots = await client.slot.findMany({
    where: {
      startsAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) },
    },
    select: SLOT_POLICY_SELECT,
    orderBy: [{ startsAt: "asc" }, { roomId: "asc" }],
  });
  return slots.flatMap((slot) => {
    const view = slotView(viewer, slot);
    return view ? [view] : [];
  });
}
