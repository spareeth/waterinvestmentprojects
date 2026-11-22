// Document permissions (teasers). Pure: no database access.
// Three levels: see the document in a list (metadata), open the file (view), and download it.
// Files are only ever served when the virus scan says CLEAN, whoever asks (one admin exception below).
// PLAN v0.3: downloads allowed by default (Document.allowDownload defaults to true); no extra material, no
// per-project grants, no data room.

import type { Prisma } from "@/generated/prisma/client";
import { DocumentKind, ScanStatus } from "@/generated/prisma/enums";
import { isPdfFilename } from "@/lib/workspace/teaser-file";
import { pipelineProjectWhere } from "./projects";
import {
  hasPipeline,
  inPipeline,
  isAdminViewer,
  isOwnCountry,
  ownCountryIds,
  type ProjectRef,
  type Viewer,
} from "./viewer";

export interface DocumentRef {
  kind: DocumentKind;
  /** The stored (cleaned) file name; its extension is the checked file type. */
  filename: string;
  scanStatus: ScanStatus;
  supersededById: string | null;
  allowDownload: boolean;
  project: ProjectRef;
}

/** Matches no document. */
export const NO_DOCUMENT: Prisma.DocumentWhereInput = { id: { in: [] } };

/**
 * Documents the viewer may see listed. Admins: all. Country users: every document of their own countries'
 * projects (any version or scan state) and, since M12, the pipeline documents of other countries. Pipeline
 * (investors, coordinators, country users): the current CLEAN teaser of each pipeline project, never older
 * versions, and only when it is a PDF (M11, PLAN v0.4 0b.4: other formats from the upload link wait for an admin
 * to attach the converted PDF).
 */
export function documentWhere(
  viewer: Viewer | null,
): Prisma.DocumentWhereInput {
  if (!viewer) return NO_DOCUMENT;
  if (isAdminViewer(viewer)) return {};
  if (!hasPipeline(viewer)) return NO_DOCUMENT;
  const pipeline: Prisma.DocumentWhereInput = {
    kind: DocumentKind.TEASER,
    supersededById: null,
    scanStatus: ScanStatus.CLEAN,
    filename: { endsWith: ".pdf", mode: "insensitive" },
    project: pipelineProjectWhere(viewer),
  };
  const own = ownCountryIds(viewer);
  if (own.length > 0) {
    return { OR: [{ project: { countryId: { in: own } } }, pipeline] };
  }
  return pipeline;
}

export function canViewDocument(
  viewer: Viewer | null,
  doc: DocumentRef,
): boolean {
  if (!viewer) return false;
  if (isAdminViewer(viewer) || isOwnCountry(viewer, doc.project.countryId)) {
    return true;
  }
  return (
    inPipeline(viewer, doc.project) &&
    doc.kind === DocumentKind.TEASER &&
    doc.supersededById === null &&
    doc.scanStatus === ScanStatus.CLEAN &&
    isPdfFilename(doc.filename)
  );
}

/** Opening the file (viewer page, stream or signed URL): visible and scanned CLEAN. */
export function canOpenDocumentFile(
  viewer: Viewer | null,
  doc: DocumentRef,
): boolean {
  return doc.scanStatus === ScanStatus.CLEAN && canViewDocument(viewer, doc);
}

/**
 * Downloading: the owning country and admins always; pipeline viewers unless an admin switched download off
 * for that teaser (allowDownload, default on).
 * M0 (user decision, 18 Nov): until a virus scanner runs (M10), admins may also download files whose scan is
 * still PENDING, so they can collect government uploads on production. Never INFECTED or FAILED files, never
 * anyone else; the download is audited with its scan status.
 */
export function canDownloadDocument(
  viewer: Viewer | null,
  doc: DocumentRef,
): boolean {
  if (isAdminViewer(viewer) && doc.scanStatus === ScanStatus.PENDING) {
    return true;
  }
  if (!canOpenDocumentFile(viewer, doc)) return false;
  return (
    doc.allowDownload ||
    isAdminViewer(viewer) ||
    isOwnCountry(viewer, doc.project.countryId)
  );
}

/**
 * Uploading or changing a teaser in the portal (new version, download switch): admins only (user decision,
 * 18 Nov). Governments upload through the upload link (M0), which the link token authorises.
 */
export function canUploadDocument(viewer: Viewer | null): boolean {
  return isAdminViewer(viewer);
}
