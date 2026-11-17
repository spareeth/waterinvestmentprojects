// Who is looking: the input to every data permission in the policy module (PLAN section 3).
// Pure functions (no database, no request), so the rules can be unit tested directly.
//
// A Viewer exists only for an account at the "active" stage of the account gate. Everyone else (no session,
// pending approval, two-step enrolment or terms still to do) gets null, and every where builder and
// can-function in src/lib/authz treats null as "nothing". That is how "a pending account sees nothing" holds
// even if a page forgets the account gate.

import {
  CountryStatus,
  MembershipRole,
  PipelineScope,
  ProjectStatus,
  UserRole,
} from "@/generated/prisma/enums";
import type { AccountStage } from "./account-gate";

export interface Viewer {
  id: string;
  role: UserRole;
  /** Country memberships. Only counted for COUNTRY users. */
  memberships: { countryId: string; role: MembershipRole }[];
  /** Which countries' published projects this user sees in the pipeline. Ignored for admins. */
  pipelineScope: PipelineScope;
  /** Countries listed for pipelineScope SELECTED. */
  pipelineCountryIds: string[];
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
  const { id, role, memberships, pipelineScope, pipelineCountryIds } =
    session.user;
  return { id, role, memberships, pipelineScope, pipelineCountryIds };
}

export function isAdminViewer(viewer: Viewer | null): boolean {
  return (
    viewer?.role === UserRole.PLATFORM_ADMIN ||
    viewer?.role === UserRole.SUMMIT_ADMIN
  );
}

/** Countries whose workspace this viewer belongs to (any membership role). Empty unless role COUNTRY. */
export function ownCountryIds(viewer: Viewer | null): string[] {
  if (viewer?.role !== UserRole.COUNTRY) return [];
  return viewer.memberships.map((m) => m.countryId);
}

/** Countries where this viewer is focal point. Empty unless role COUNTRY. */
export function focalCountryIds(viewer: Viewer | null): string[] {
  if (viewer?.role !== UserRole.COUNTRY) return [];
  return viewer.memberships
    .filter((m) => m.role === MembershipRole.FOCAL_POINT)
    .map((m) => m.countryId);
}

export function isOwnCountry(viewer: Viewer | null, countryId: string) {
  return ownCountryIds(viewer).includes(countryId);
}

export function isFocalPointOf(viewer: Viewer | null, countryId: string) {
  return focalCountryIds(viewer).includes(countryId);
}

/** Admins, or the focal point of that country: the people who act for a country. */
export function actsForCountry(viewer: Viewer | null, countryId: string) {
  return isAdminViewer(viewer) || isFocalPointOf(viewer, countryId);
}

/** True when an admin (not a member of the country) acts for it, e.g. acknowledging or deciding on behalf. */
export function actsOnBehalf(viewer: Viewer | null, countryId: string) {
  return isAdminViewer(viewer) && !isOwnCountry(viewer, countryId);
}

/**
 * Countries whose published projects the viewer sees in the pipeline: "all", a list, or none (empty list).
 * Admins are not covered here; they see everything everywhere.
 */
export function pipelineCountries(viewer: Viewer | null): "all" | string[] {
  if (!viewer) return [];
  if (viewer.pipelineScope === PipelineScope.ALL) return "all";
  if (viewer.pipelineScope === PipelineScope.SELECTED) {
    return viewer.pipelineCountryIds;
  }
  return [];
}

/** Does the viewer see any country's pipeline at all? */
export function hasPipeline(viewer: Viewer | null): boolean {
  const countries = pipelineCountries(viewer);
  return countries === "all" || countries.length > 0;
}

/**
 * Is this project in the viewer's pipeline? Only PUBLISHED projects of ACTIVE countries within the viewer's
 * pipeline scope. This is what investors (and country users given a wider scope) see of other countries.
 */
export function inPipeline(viewer: Viewer | null, project: ProjectRef) {
  if (!viewer) return false;
  if (project.status !== ProjectStatus.PUBLISHED) return false;
  if (project.country.status !== CountryStatus.ACTIVE) return false;
  const countries = pipelineCountries(viewer);
  return countries === "all" || countries.includes(project.countryId);
}
