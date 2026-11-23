// Project permissions (PLAN v0.3 section 4, M3). Pure: Prisma where builders and can-functions, no database
// access. Every project query must AND its own filters with projectWhere(viewer):
//   db.project.findMany({ where: { AND: [projectWhere(viewer), filters] } })
//
// v0.3 (user decision, 18 Nov): admins create, edit, publish and withdraw (the admin console, M7). Governments add
// teasers through the upload link (M0), not the portal.
// M12 (PLAN v0.4 0b.14): country users see their own countries' projects (any status) plus the published pipeline
// of every country, read-only.

import type { Prisma } from "@/generated/prisma/client";
import { CountryStatus, ProjectStatus } from "@/generated/prisma/enums";
import {
  hasPipeline,
  inPipeline,
  isAdminViewer,
  isOwnCountry,
  ownCountryIds,
  type ProjectRef,
  type Viewer,
} from "./viewer";

/** Matches no project. */
export const NO_PROJECT: Prisma.ProjectWhereInput = { id: { in: [] } };

/** The pipeline: PUBLISHED projects of ACTIVE countries, for investors, WBG coordinators and country users. */
export function pipelineProjectWhere(
  viewer: Viewer | null,
): Prisma.ProjectWhereInput {
  if (!hasPipeline(viewer)) return NO_PROJECT;
  return {
    status: ProjectStatus.PUBLISHED,
    country: { status: CountryStatus.ACTIVE },
  };
}

/**
 * Projects the viewer may see. Admins: all. Country users: every project of their own countries (drafts and
 * withdrawn included) and the pipeline (other countries' PUBLISHED projects only). Investors and WBG
 * coordinators: the pipeline. Anyone else: nothing.
 */
export function projectWhere(viewer: Viewer | null): Prisma.ProjectWhereInput {
  if (!viewer) return NO_PROJECT;
  if (isAdminViewer(viewer)) return {};
  const own = ownCountryIds(viewer);
  if (own.length > 0) {
    return { OR: [{ countryId: { in: own } }, pipelineProjectWhere(viewer)] };
  }
  return pipelineProjectWhere(viewer);
}

export function canViewProject(
  viewer: Viewer | null,
  project: ProjectRef,
): boolean {
  if (!viewer) return false;
  return (
    isAdminViewer(viewer) ||
    isOwnCountry(viewer, project.countryId) ||
    inPipeline(viewer, project)
  );
}

/** True when the viewer sees this project only as part of the pipeline (investors, coordinators). */
export function seesAsPipeline(
  viewer: Viewer | null,
  project: ProjectRef,
): boolean {
  return (
    !isAdminViewer(viewer) &&
    !isOwnCountry(viewer, project.countryId) &&
    inPipeline(viewer, project)
  );
}

/** Adding a project in the portal: admins only (countries submit through the upload link). */
export function canCreateProject(viewer: Viewer | null): boolean {
  return isAdminViewer(viewer);
}

/** Editing title and metadata (sector, PPP model, size, stage) of any project: admins. */
export function canEditProject(viewer: Viewer | null): boolean {
  return isAdminViewer(viewer);
}

/**
 * Editing a project's key facts (23 Nov, Sajid): admins always; the person who uploaded the project too, while it
 * is not in the pipeline (drafts and withdrawn ones) and only for their own country. `isUploader` comes from
 * isProjectUploader (src/lib/authz/data.ts): a teaser uploaded from their account, or an upload-link submission
 * made with their account's email. Other users of the country, coordinators and investors cannot edit.
 */
export function canEditProjectFacts(
  viewer: Viewer | null,
  project: Pick<ProjectRef, "countryId" | "status">,
  isUploader: boolean,
): boolean {
  if (canEditProject(viewer)) return true;
  return (
    isUploader &&
    isOwnCountry(viewer, project.countryId) &&
    project.status !== ProjectStatus.PUBLISHED
  );
}

/**
 * Role part of publishing: admins, for a project not yet PUBLISHED. Publishing also needs a current clean
 * teaser: use publishBlocker() in data.ts.
 */
export function canPublishProject(
  viewer: Viewer | null,
  project: Pick<ProjectRef, "status">,
): boolean {
  return isAdminViewer(viewer) && project.status !== ProjectStatus.PUBLISHED;
}

/** Unpublishing (status WITHDRAWN): admins, for a PUBLISHED project. */
export function canWithdrawProject(
  viewer: Viewer | null,
  project: Pick<ProjectRef, "status">,
): boolean {
  return isAdminViewer(viewer) && project.status === ProjectStatus.PUBLISHED;
}

/**
 * Deleting a project for good, with its teaser files and meeting requests (23 Nov, Sajid): admins any project;
 * otherwise only the person who uploaded it (isProjectUploader), for their own country, while it is not in the
 * pipeline (drafts and withdrawn ones). Same rule as editing its key facts (canEditProjectFacts). A published
 * project is deleted by the Summit team.
 */
export function canDeleteProject(
  viewer: Viewer | null,
  project: Pick<ProjectRef, "countryId" | "status">,
  isUploader: boolean,
): boolean {
  if (isAdminViewer(viewer)) return true;
  return (
    isUploader &&
    isOwnCountry(viewer, project.countryId) &&
    project.status !== ProjectStatus.PUBLISHED
  );
}
