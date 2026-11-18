// Country workspace (M5, PLAN F3/F4). Pure: no database access.
// The workspace is where a country manages its own projects. It is NOT the pipeline: a country user whose
// pipeline scope shows other countries' published teasers still only manages their own country here.

import type { Prisma } from "@/generated/prisma/client";
import { CountryStatus, DocumentKind } from "@/generated/prisma/enums";
import { NO_COUNTRY } from "./people";
import {
  canEditProject,
  canPublishProject,
  canWithdrawProject,
  NO_PROJECT,
} from "./projects";
import { canAcknowledge, canUploadDocument } from "./documents";
import {
  actsOnBehalf,
  isAdminViewer,
  ownCountryIds,
  type ProjectRef,
  type Viewer,
} from "./viewer";

/** Admins (for every country) and country users (for their own countries) have a workspace. */
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

/** Countries the viewer may add projects for: admins any ACTIVE country, country users their own ACTIVE ones. */
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
  acknowledge: boolean;
  /** An admin acting for the country: acknowledgements need an evidence note. */
  onBehalf: boolean;
}

export function workspacePermissions(
  viewer: Viewer | null,
  project: Pick<ProjectRef, "countryId" | "status">,
): WorkspacePermissions {
  return {
    edit: canEditProject(viewer, project),
    uploadTeaser: canUploadDocument(viewer, project, DocumentKind.TEASER),
    publish: canPublishProject(viewer, project),
    withdraw: canWithdrawProject(viewer, project),
    acknowledge: canAcknowledge(viewer, project),
    onBehalf: actsOnBehalf(viewer, project.countryId),
  };
}
