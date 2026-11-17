// Users, countries, audit log and exports. Pure: no database access.

import type { Prisma } from "@/generated/prisma/client";
import { CountryStatus } from "@/generated/prisma/enums";
import {
  isAdminViewer,
  ownCountryIds,
  pipelineCountries,
  type Viewer,
} from "./viewer";

/** Matches nothing. */
export const NO_USER: Prisma.UserWhereInput = { id: { in: [] } };
export const NO_COUNTRY: Prisma.CountryWhereInput = { id: { in: [] } };
export const NO_AUDIT_EVENT: Prisma.AuditEventWhereInput = { id: { in: [] } };

/**
 * People the viewer may list. Admins: everyone. Country users: themselves and the members of their own
 * country ("People" page). Investors: themselves. Requesters on a country's requests are reached through the
 * request, not through this list.
 */
export function userWhere(viewer: Viewer | null): Prisma.UserWhereInput {
  if (!viewer) return NO_USER;
  if (isAdminViewer(viewer)) return {};
  const own = ownCountryIds(viewer);
  if (own.length === 0) return { id: viewer.id };
  return {
    OR: [
      { id: viewer.id },
      { memberships: { some: { countryId: { in: own } } } },
    ],
  };
}

/** Countries the viewer may see named (filters, workspace switcher): own countries plus the pipeline's. */
export function countryWhere(viewer: Viewer | null): Prisma.CountryWhereInput {
  if (!viewer) return NO_COUNTRY;
  if (isAdminViewer(viewer)) return {};
  const branches: Prisma.CountryWhereInput[] = [];
  const own = ownCountryIds(viewer);
  if (own.length > 0) branches.push({ id: { in: own } });
  const pipeline = pipelineCountries(viewer);
  if (pipeline === "all") branches.push({ status: CountryStatus.ACTIVE });
  else if (pipeline.length > 0) {
    branches.push({ status: CountryStatus.ACTIVE, id: { in: pipeline } });
  }
  if (branches.length === 0) return NO_COUNTRY;
  return branches.length === 1 ? branches[0] : { OR: branches };
}

/** The audit log is for the Summit team and Terra only. */
export function auditEventWhere(
  viewer: Viewer | null,
): Prisma.AuditEventWhereInput {
  return isAdminViewer(viewer) ? {} : NO_AUDIT_EVENT;
}

export function canViewAuditLog(viewer: Viewer | null): boolean {
  return isAdminViewer(viewer);
}

/** CSV exports for WBG/GCFC (requests, users, audit). */
export function canExport(viewer: Viewer | null): boolean {
  return isAdminViewer(viewer);
}
