// Document permissions (teasers, EXTRA material, Phase 2 DATAROOM). Pure: no database access.
// Three levels: see the document in a list (metadata), open the file (view), and download it.
// Files are only ever served when the virus scan says CLEAN, whoever asks.

import type { Prisma } from "@/generated/prisma/client";
import { DocumentKind, ScanStatus } from "@/generated/prisma/enums";
import { type GrantRef, activeGrantWhere, isGrantActive } from "./grants";
import { canEditProject, pipelineProjectWhere } from "./projects";
import {
  actsForCountry,
  hasPipeline,
  inPipeline,
  isAdminViewer,
  isOwnCountry,
  ownCountryIds,
  type ProjectRef,
  type Viewer,
} from "./viewer";

export interface DocumentRef {
  projectId: string;
  kind: DocumentKind;
  scanStatus: ScanStatus;
  supersededById: string | null;
  allowDownload: boolean;
  project: ProjectRef;
}

/** Facts the document rules need besides the document: the viewer's grants and the clock. */
export interface DocumentContext {
  grants: GrantRef[];
  now: Date;
}

/** Matches no document. */
export const NO_DOCUMENT: Prisma.DocumentWhereInput = { id: { in: [] } };

/**
 * Documents the viewer may see listed. Admins: all. Own country: every document of its projects (any kind,
 * version or scan state). Pipeline: the current CLEAN teaser of each pipeline project, plus current CLEAN
 * EXTRA material where the viewer holds an active grant. DATAROOM is never in the pipeline.
 */
export function documentWhere(
  viewer: Viewer | null,
  now: Date,
): Prisma.DocumentWhereInput {
  if (!viewer) return NO_DOCUMENT;
  if (isAdminViewer(viewer)) return {};
  const branches: Prisma.DocumentWhereInput[] = [];
  const own = ownCountryIds(viewer);
  if (own.length > 0) branches.push({ project: { countryId: { in: own } } });
  if (hasPipeline(viewer)) {
    branches.push({
      AND: [
        { supersededById: null },
        { scanStatus: ScanStatus.CLEAN },
        { project: pipelineProjectWhere(viewer) },
        {
          OR: [
            { kind: DocumentKind.TEASER },
            {
              kind: DocumentKind.EXTRA,
              project: { grants: { some: activeGrantWhere(viewer.id, now) } },
            },
          ],
        },
      ],
    });
  }
  if (branches.length === 0) return NO_DOCUMENT;
  return branches.length === 1 ? branches[0] : { OR: branches };
}

export function canViewDocument(
  viewer: Viewer | null,
  doc: DocumentRef,
  context: DocumentContext,
): boolean {
  if (!viewer) return false;
  if (isAdminViewer(viewer) || isOwnCountry(viewer, doc.project.countryId)) {
    return true;
  }
  if (!inPipeline(viewer, doc.project)) return false;
  if (doc.supersededById !== null || doc.scanStatus !== ScanStatus.CLEAN) {
    return false;
  }
  if (doc.kind === DocumentKind.TEASER) return true;
  if (doc.kind === DocumentKind.EXTRA) {
    return context.grants.some((g) =>
      isGrantActive(g, viewer.id, doc.projectId, context.now),
    );
  }
  return false;
}

/** Opening the file (viewer page, stream or signed URL): visible and scanned CLEAN. */
export function canOpenDocumentFile(
  viewer: Viewer | null,
  doc: DocumentRef,
  context: DocumentContext,
): boolean {
  return (
    doc.scanStatus === ScanStatus.CLEAN && canViewDocument(viewer, doc, context)
  );
}

/** Downloading: the owning country and admins always; pipeline viewers only where allowDownload is on. */
export function canDownloadDocument(
  viewer: Viewer | null,
  doc: DocumentRef,
  context: DocumentContext,
): boolean {
  if (!canOpenDocumentFile(viewer, doc, context)) return false;
  return (
    doc.allowDownload ||
    isAdminViewer(viewer) ||
    isOwnCountry(viewer, doc.project.countryId)
  );
}

/**
 * Uploading or changing a document (new version, download flag). TEASER and EXTRA follow project editing
 * (members on drafts only). DATAROOM is Phase 2: admins only until it is designed.
 */
export function canUploadDocument(
  viewer: Viewer | null,
  project: Pick<ProjectRef, "countryId" | "status">,
  kind: DocumentKind,
): boolean {
  if (kind === DocumentKind.DATAROOM) return isAdminViewer(viewer);
  return canEditProject(viewer, project);
}

/** Acknowledging a teaser before publishing: whoever may publish for the country (focal point or admin). */
export function canAcknowledge(
  viewer: Viewer | null,
  project: Pick<ProjectRef, "countryId">,
): boolean {
  return actsForCountry(viewer, project.countryId);
}
