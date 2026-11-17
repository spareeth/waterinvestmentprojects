// ProjectGrant permissions (F11): explicit, expiring access to EXTRA material on one project for one user.
// Pure: Prisma where builders and can-functions, no database access.

import type { Prisma } from "@/generated/prisma/client";
import { GrantScope, ProjectStatus, UserRole } from "@/generated/prisma/enums";
import {
  actsForCountry,
  inPipeline,
  isAdminViewer,
  ownCountryIds,
  type ProjectRef,
  type Viewer,
} from "./viewer";

export interface GrantRef {
  userId: string;
  projectId: string;
  scope: GrantScope;
  expiresAt: Date;
  revokedAt: Date | null;
}

/** Matches no grant. */
export const NO_GRANT: Prisma.ProjectGrantWhereInput = { id: { in: [] } };

/** Grants that currently give this user EXTRA material: not revoked and not yet expired. */
export function activeGrantWhere(
  userId: string,
  now: Date,
): Prisma.ProjectGrantWhereInput {
  return {
    userId,
    scope: GrantScope.EXTRA,
    revokedAt: null,
    expiresAt: { gt: now },
  };
}

export function isGrantActive(
  grant: GrantRef,
  userId: string,
  projectId: string,
  now: Date,
): boolean {
  return (
    grant.userId === userId &&
    grant.projectId === projectId &&
    grant.scope === GrantScope.EXTRA &&
    grant.revokedAt === null &&
    grant.expiresAt.getTime() > now.getTime()
  );
}

/** Grants the viewer may see: admins all; the owning country its projects' grants; a grantee their own. */
export function projectGrantWhere(
  viewer: Viewer | null,
): Prisma.ProjectGrantWhereInput {
  if (!viewer) return NO_GRANT;
  if (isAdminViewer(viewer)) return {};
  const own = ownCountryIds(viewer);
  if (own.length === 0) return { userId: viewer.id };
  return {
    OR: [{ userId: viewer.id }, { project: { countryId: { in: own } } }],
  };
}

/**
 * Admins and the focal point share extra material on a PUBLISHED project, with an investor who can already
 * see that project in their pipeline. Grants never widen what someone sees of the pipeline itself.
 */
export function canGrantExtra(
  viewer: Viewer | null,
  project: ProjectRef,
  grantee: Viewer,
): boolean {
  return (
    actsForCountry(viewer, project.countryId) &&
    project.status === ProjectStatus.PUBLISHED &&
    grantee.role === UserRole.INVESTOR &&
    inPipeline(grantee, project)
  );
}

export function canRevokeGrant(
  viewer: Viewer | null,
  grant: { revokedAt: Date | null; project: { countryId: string } },
): boolean {
  return (
    grant.revokedAt === null && actsForCountry(viewer, grant.project.countryId)
  );
}
