// Admin console permissions (M7, PLAN v0.3 F7 and section 4). Pure: no database access.
//
// Summit admins (WBG, GCFC, BCG nominees) and Terra's platform admins manage countries, focal points, WBG
// coordinators, project metadata, publishing, accounts and exports. Everyone else (country focal points, WBG
// coordinators, investors, no viewer) gets none of it: default deny. The audit log export is for platform admins
// only ("Platform admin: audit export", PLAN section 4). Publishing and editing single projects keep their own
// rules in projects.ts; account creation keeps account-policies.ts.

import type { Prisma } from "@/generated/prisma/client";
import { UserRole } from "@/generated/prisma/enums";
import { assignableRoles } from "./account-policies";
import { NO_PROJECT } from "./projects";
import { isAdminViewer, type Viewer } from "./viewer";

/** Matches no country contact. */
export const NO_CONTACT: Prisma.CountryContactWhereInput = { id: { in: [] } };

/** The /admin pages as a whole. */
export function canUseAdminConsole(viewer: Viewer | null): boolean {
  return isAdminViewer(viewer);
}

/** Add countries and switch them on or off. */
export function canManageCountries(viewer: Viewer | null): boolean {
  return isAdminViewer(viewer);
}

/** Add, edit and remove focal point and WBG coordinator contacts (one by one or from a CSV). */
export function canManageContacts(viewer: Viewer | null): boolean {
  return isAdminViewer(viewer);
}

/** Contacts the viewer may list: admins all, everyone else none. */
export function contactWhere(
  viewer: Viewer | null,
): Prisma.CountryContactWhereInput {
  return canManageContacts(viewer) ? {} : NO_CONTACT;
}

/** Projects in the admin overview, import and exports: admins all, everyone else none. */
export function adminProjectWhere(
  viewer: Viewer | null,
): Prisma.ProjectWhereInput {
  return isAdminViewer(viewer) ? {} : NO_PROJECT;
}

/** CSV import of PPP model, size and development stage (PLAN 0.5). */
export function canImportProjectMetadata(viewer: Viewer | null): boolean {
  return isAdminViewer(viewer);
}

/** Bulk account hand-out. Each row is still checked by canCreateAccount (roles this admin may give). */
export function canBulkCreateAccounts(viewer: Viewer | null): boolean {
  return isAdminViewer(viewer);
}

/**
 * Switching an account off or on again: admins, never their own account, and Summit admins not for platform
 * admins (same reach as handing out accounts).
 */
export function canSetAccountStatus(
  viewer: Viewer | null,
  target: { id: string; role: UserRole },
): boolean {
  if (!viewer || !isAdminViewer(viewer) || viewer.id === target.id) {
    return false;
  }
  return assignableRoles(viewer).includes(target.role);
}

export type AdminExportKind =
  "projects" | "submissions" | "accounts" | "contacts" | "audit" | "country";

/** Admin exports. The audit log only for platform admins; every other export for both admin roles. */
export function canExportKind(
  viewer: Viewer | null,
  kind: AdminExportKind,
): boolean {
  if (kind === "audit") return viewer?.role === UserRole.PLATFORM_ADMIN;
  return isAdminViewer(viewer);
}
