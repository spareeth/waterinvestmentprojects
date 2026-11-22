// Who is looking: the input to every data permission in the policy module (PLAN v0.3 section 4).
// Pure functions (no database, no request), so the rules can be unit tested directly.
//
// A Viewer exists only for an account at the "active" stage of the account gate. Everyone else (no session,
// a password still to change, an investor who has not accepted the investor acknowledgement, ...) gets null,
// and every where builder and can-function in src/lib/authz treats null as "nothing". That is how "investors
// see no pipeline before the acknowledgement" holds even if a page forgets the account gate.
//
// Roles (PLAN v0.3 section 4):
// - PLATFORM_ADMIN, SUMMIT_ADMIN: everything.
// - COUNTRY: their own countries' projects (any status) and requests; accept or decline those requests. Since M12
//   (PLAN v0.4 0b.14) also the whole published pipeline, read-only, like investors (never other countries'
//   drafts, older teaser versions or requests).
// - WBG_COORDINATOR: every published teaser, and read-only the requests of their own countries.
// - INVESTOR: every published teaser; their own requests.
// A user's countries are their CountryMembership rows. The membership role (focal point or member) no longer
// changes what a country user may do (user decision, 18 Nov).

import {
  CountryStatus,
  MembershipRole,
  ProjectStatus,
  UserRole,
} from "@/generated/prisma/enums";
import type { AccountStage } from "./account-gate";

export interface Viewer {
  id: string;
  role: UserRole;
  /** Country memberships. Counted for COUNTRY and WBG_COORDINATOR users only. */
  memberships: { countryId: string; role: MembershipRole }[];
}

/** The minimum a policy needs about a project. Select it with PROJECT_POLICY_SELECT. */
export interface ProjectRef {
  countryId: string;
  status: ProjectStatus;
  country: { status: CountryStatus };
}

export const PROJECT_POLICY_SELECT = {
  countryId: true,
  status: true,
  country: { select: { status: true } },
} as const;

/** Thrown by the server-side helpers. "not_found" is used whenever existence itself must not leak. */
export class AuthzError extends Error {
  constructor(public readonly code: "not_found" | "forbidden") {
    super(code === "not_found" ? "Not found" : "Not allowed");
    this.name = "AuthzError";
  }
}

/** A Viewer for an active account; null for everyone else. */
export function viewerFrom(
  session: { stage: AccountStage; user: Viewer } | null | undefined,
): Viewer | null {
  if (!session || session.stage !== "active") return null;
  const { id, role, memberships } = session.user;
  return { id, role, memberships };
}

export function isAdminViewer(viewer: Viewer | null): boolean {
  return (
    viewer?.role === UserRole.PLATFORM_ADMIN ||
    viewer?.role === UserRole.SUMMIT_ADMIN
  );
}

/** Countries a COUNTRY user belongs to. Empty for every other role. */
export function ownCountryIds(viewer: Viewer | null): string[] {
  if (viewer?.role !== UserRole.COUNTRY) return [];
  return viewer.memberships.map((m) => m.countryId);
}

/** Countries a WBG coordinator covers. Empty for every other role. */
export function coordinatedCountryIds(viewer: Viewer | null): string[] {
  if (viewer?.role !== UserRole.WBG_COORDINATOR) return [];
  return viewer.memberships.map((m) => m.countryId);
}

export function isOwnCountry(viewer: Viewer | null, countryId: string) {
  return ownCountryIds(viewer).includes(countryId);
}

export function coordinatesCountry(viewer: Viewer | null, countryId: string) {
  return coordinatedCountryIds(viewer).includes(countryId);
}

/** Admins, or any user of that country: the people who decide for a country (meeting requests). */
export function actsForCountry(viewer: Viewer | null, countryId: string) {
  return isAdminViewer(viewer) || isOwnCountry(viewer, countryId);
}

/** True when an admin (not a user of the country) acts for it, e.g. deciding a request on its behalf. */
export function actsOnBehalf(viewer: Viewer | null, countryId: string) {
  return isAdminViewer(viewer) && !isOwnCountry(viewer, countryId);
}

/**
 * Does the viewer see the pipeline (every published teaser)? Investors, WBG coordinators and, since M12
 * (PLAN v0.4 0b.14), country users who belong to at least one country. Admins see everything anyway.
 * A COUNTRY account without a country sees nothing (default deny).
 * PLAN v0.3 point 8: no per-project or per-country restriction for investors.
 */
export function hasPipeline(viewer: Viewer | null): boolean {
  return (
    viewer?.role === UserRole.INVESTOR ||
    viewer?.role === UserRole.WBG_COORDINATOR ||
    ownCountryIds(viewer).length > 0
  );
}

/** Is this project in the viewer's pipeline? PUBLISHED projects of ACTIVE countries, for pipeline roles. */
export function inPipeline(viewer: Viewer | null, project: ProjectRef) {
  return (
    hasPipeline(viewer) &&
    project.status === ProjectStatus.PUBLISHED &&
    project.country.status === CountryStatus.ACTIVE
  );
}
