// Project permissions (PLAN section 3, M4). Pure: Prisma where builders and can-functions, no database access.
// Every project query must AND its own filters with projectWhere(viewer):
//   db.project.findMany({ where: { AND: [projectWhere(viewer), filters] } })

import type { Prisma } from "@/generated/prisma/client";
import { CountryStatus, ProjectStatus } from "@/generated/prisma/enums";
import {
  actsForCountry,
  hasPipeline,
  inPipeline,
  isAdminViewer,
  isOwnCountry,
  ownCountryIds,
  pipelineCountries,
  type ProjectRef,
  type Viewer,
} from "./viewer";

/** Matches no project. */
export const NO_PROJECT: Prisma.ProjectWhereInput = { id: { in: [] } };

/** Projects in the viewer's pipeline: PUBLISHED, ACTIVE country, within the viewer's pipeline scope. */
export function pipelineProjectWhere(
  viewer: Viewer | null,
): Prisma.ProjectWhereInput {
  const countries = pipelineCountries(viewer);
  if (countries !== "all" && countries.length === 0) return NO_PROJECT;
  return {
    status: ProjectStatus.PUBLISHED,
    country: { status: CountryStatus.ACTIVE },
    ...(countries === "all" ? {} : { countryId: { in: countries } }),
  };
}

/**
 * Projects the viewer may see. Admins: all. Country users: every project of their own country (drafts and
 * withdrawn included) plus their pipeline. Investors: their pipeline. Anyone else: nothing.
 */
export function projectWhere(viewer: Viewer | null): Prisma.ProjectWhereInput {
  if (!viewer) return NO_PROJECT;
  if (isAdminViewer(viewer)) return {};
  const own = ownCountryIds(viewer);
  const branches: Prisma.ProjectWhereInput[] = [];
  if (own.length > 0) branches.push({ countryId: { in: own } });
  if (hasPipeline(viewer)) branches.push(pipelineProjectWhere(viewer));
  if (branches.length === 0) return NO_PROJECT;
  return branches.length === 1 ? branches[0] : { OR: branches };
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

/** True when the viewer sees this project only as part of the pipeline, not as its own workspace. */
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

/** Admins, or any member of the country (focal point or member). */
export function canCreateProject(
  viewer: Viewer | null,
  countryId: string,
): boolean {
  return isAdminViewer(viewer) || isOwnCountry(viewer, countryId);
}

/**
 * Admins and the country's focal point edit any of its projects. Members edit DRAFT projects only
 * (user decision, 17 Nov): once investors can see a project, changes go through the focal point.
 */
export function canEditProject(
  viewer: Viewer | null,
  project: Pick<ProjectRef, "countryId" | "status">,
): boolean {
  if (actsForCountry(viewer, project.countryId)) return true;
  return (
    isOwnCountry(viewer, project.countryId) &&
    project.status === ProjectStatus.DRAFT
  );
}

/**
 * Role part of publishing: admins (on behalf) and the focal point, for a project not yet PUBLISHED.
 * Publishing also needs a stored Acknowledgement on the current clean teaser: use publishBlocker() in data.ts.
 */
export function canPublishProject(
  viewer: Viewer | null,
  project: Pick<ProjectRef, "countryId" | "status">,
): boolean {
  return (
    actsForCountry(viewer, project.countryId) &&
    project.status !== ProjectStatus.PUBLISHED
  );
}

/** Unpublishing (status WITHDRAWN): admins and the focal point, for a PUBLISHED project. */
export function canWithdrawProject(
  viewer: Viewer | null,
  project: Pick<ProjectRef, "countryId" | "status">,
): boolean {
  return (
    actsForCountry(viewer, project.countryId) &&
    project.status === ProjectStatus.PUBLISHED
  );
}
