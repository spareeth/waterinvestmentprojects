// Teaser upload links and submissions (M0, PLAN v0.3 F0). Pure: no database access.
//
// Two kinds of caller:
// - Signed-in admins (PLATFORM_ADMIN, SUMMIT_ADMIN) create and revoke links and see every submission.
//   Everyone else sees no submission and no link (default deny), including country users and investors.
// - A government uploader has no account: the link token alone authorises one thing, adding a submission for
//   the link's country. uploadLinkState() decides whether a stored link still works; the database lookup by
//   token hash is in upload-links.ts.

import type { Prisma } from "@/generated/prisma/client";
import { CountryStatus } from "@/generated/prisma/enums";
import { isAdminViewer, ownCountryIds, type Viewer } from "./viewer";

/** Matches no submission. */
export const NO_SUBMISSION: Prisma.SubmissionWhereInput = { id: { in: [] } };
/** Matches no upload link. */
export const NO_UPLOAD_LINK: Prisma.UploadLinkWhereInput = { id: { in: [] } };

export function canManageUploadLinks(viewer: Viewer | null): boolean {
  return isAdminViewer(viewer);
}

/**
 * 22 Nov (user request): a country focal point (COUNTRY role) adds teasers from My projects with the same form
 * and checks as the upload link, for its own countries only. Without a country: whether the viewer may use the
 * page at all. Coordinators, investors and admins (who use Add a project) may not.
 */
export function canSubmitFromWorkspace(
  viewer: Viewer | null,
  countryId?: string,
): boolean {
  const own = ownCountryIds(viewer);
  return countryId === undefined ? own.length > 0 : own.includes(countryId);
}

export function canListSubmissions(viewer: Viewer | null): boolean {
  return isAdminViewer(viewer);
}

/** Submissions the viewer may list: admins all, everyone else none. */
export function submissionWhere(
  viewer: Viewer | null,
): Prisma.SubmissionWhereInput {
  return canListSubmissions(viewer) ? {} : NO_SUBMISSION;
}

/** Upload links the viewer may list: admins all, everyone else none. */
export function uploadLinkWhere(
  viewer: Viewer | null,
): Prisma.UploadLinkWhereInput {
  return canManageUploadLinks(viewer) ? {} : NO_UPLOAD_LINK;
}

export type UploadLinkState = "valid" | "not_found" | "revoked" | "expired";

/** What uploadLinkState() needs about a stored link. */
export interface UploadLinkRef {
  countryId: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  /** The link's country; null for the generic link. */
  country: { status: CountryStatus } | null;
}

/**
 * Whether a link still accepts uploads. Revoked wins over expired. A country link stops working when its
 * country is no longer ACTIVE (reported as revoked: it was switched off on purpose).
 */
export function uploadLinkState(
  link: UploadLinkRef | null,
  now: Date,
): UploadLinkState {
  if (!link) return "not_found";
  if (link.revokedAt) return "revoked";
  if (link.countryId !== null && link.country?.status !== CountryStatus.ACTIVE)
    return "revoked";
  if (link.expiresAt.getTime() <= now.getTime()) return "expired";
  return "valid";
}

/**
 * Which country a submission through this link belongs to. A country link fixes the country: whatever the form
 * sends is ignored. Only the generic link takes the country from the form (and the service checks it is ACTIVE).
 */
export function submissionCountryId(
  link: Pick<UploadLinkRef, "countryId">,
  requestedCountryId: string | null | undefined,
): string | null {
  if (link.countryId !== null) return link.countryId;
  const requested = requestedCountryId?.trim();
  return requested ? requested : null;
}
