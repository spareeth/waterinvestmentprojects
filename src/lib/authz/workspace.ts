// Country workspace. Pure: no database access.
// The workspace lists a country's own projects. v0.3 (user decision, 18 Nov): country users read it only;
// admins create, edit, upload, publish and withdraw there until the admin console (M7) takes over.

import type { Prisma } from "@/generated/prisma/client";
import { CountryStatus } from "@/generated/prisma/enums";
import { NO_COUNTRY } from "./people";
import {
  canDeleteProject,
  canEditProjectFacts,
  canPublishProject,
  canWithdrawProject,
  NO_PROJECT,
} from "./projects";
import { canUploadDocument } from "./documents";
import {
  actsOnBehalf,
  isAdminViewer,
  ownCountryIds,
  type ProjectRef,
  type Viewer,
} from "./viewer";

/** Admins (for every country) and country users (their own countries, read only) have a workspace. */
export function canUseWorkspace(viewer: Viewer | null): boolean {
  return isAdminViewer(viewer) || ownCountryIds(viewer).length > 0;
}

/** Projects in the viewer's workspace. Admins: all. Country users: their own countries'. Others: none. */
export function workspaceProjectWhere(
  viewer: Viewer | null,
): Prisma.ProjectWhereInput {
  if (!viewer) return NO_PROJECT;
  if (isAdminViewer(viewer)) return {};
  const own = ownCountryIds(viewer);
  return own.length > 0 ? { countryId: { in: own } } : NO_PROJECT;
}

/**
 * ACTIVE countries in the viewer's workspace: admins all, country users their own. Adding a project also needs
 * canCreateProject (admins only).
 */
export function workspaceCountryWhere(
  viewer: Viewer | null,
): Prisma.CountryWhereInput {
  if (!viewer) return NO_COUNTRY;
  if (isAdminViewer(viewer)) return { status: CountryStatus.ACTIVE };
  const own = ownCountryIds(viewer);
  return own.length > 0
    ? { id: { in: own }, status: CountryStatus.ACTIVE }
    : NO_COUNTRY;
}

/** What the viewer may do with one workspace project, for the page to show or hide controls. */
export interface WorkspacePermissions {
  edit: boolean;
  uploadTeaser: boolean;
  publish: boolean;
  withdraw: boolean;
  /** 23 Nov: delete the project for good (canDeleteProject). */
  delete: boolean;
  /** An admin acting for the country: the upload consent records the government's written consent. */
  onBehalf: boolean;
}

export function workspacePermissions(
  viewer: Viewer | null,
  project: Pick<ProjectRef, "countryId" | "status">,
  /** 23 Nov: the viewer uploaded this project (isProjectUploader), so may edit its key facts while unpublished. */
  isUploader = false,
): WorkspacePermissions {
  return {
    edit: canEditProjectFacts(viewer, project, isUploader),
    uploadTeaser: canUploadDocument(viewer),
    publish: canPublishProject(viewer, project),
    withdraw: canWithdrawProject(viewer, project),
    delete: canDeleteProject(viewer, project),
    onBehalf: actsOnBehalf(viewer, project.countryId),
  };
}
