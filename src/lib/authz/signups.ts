// Meeting sign-up permissions (25 Nov, WBG: investors sign up to meet a country's delegation, ticking every time
// they could make; the Summit team allocates the meetings later). Pure: no database access.
// A sign-up is visible only to the investor who made it, the users of that country, that country's WBG
// coordinators (read only) and admins. Countries never see other countries' sign-ups; investors never see other
// investors' sign-ups. Nobody but the investor changes a sign-up, and only before the deadline.

import type { Prisma } from "@/generated/prisma/client";
import {
  MeetingSignupStatus,
  type ProjectStatus,
  UserRole,
} from "@/generated/prisma/enums";
import {
  coordinatedCountryIds,
  inPipeline,
  isAdminViewer,
  ownCountryIds,
  type ProjectRef,
  type Viewer,
} from "./viewer";

/** Matches no sign-up. */
export const NO_SIGNUP: Prisma.MeetingSignupWhereInput = { id: { in: [] } };

/**
 * Sign-ups the viewer may read. Admins: all. Investors: their own. Country users and WBG coordinators: their
 * countries'. Anyone else: none.
 */
export function meetingSignupWhere(
  viewer: Viewer | null,
): Prisma.MeetingSignupWhereInput {
  if (!viewer) return NO_SIGNUP;
  if (isAdminViewer(viewer)) return {};
  if (viewer.role === UserRole.INVESTOR) return { requesterId: viewer.id };
  const countries = [
    ...ownCountryIds(viewer),
    ...coordinatedCountryIds(viewer),
  ];
  return countries.length > 0 ? { countryId: { in: countries } } : NO_SIGNUP;
}

/**
 * Signing up for meetings with a country, from one of its projects in the pipeline: investors only, until the
 * sign-up deadline.
 */
export function canSignUpForMeetings(
  viewer: Viewer | null,
  project: ProjectRef,
  deadlinePassed: boolean,
): boolean {
  return (
    !deadlinePassed &&
    viewer?.role === UserRole.INVESTOR &&
    inPipeline(viewer, project)
  );
}

/** A project of interest on a sign-up: a project of the same country that is in the pipeline. */
export function isSignupProject(
  countryId: string,
  project: {
    countryId: string;
    status: ProjectStatus;
    country: { status: ProjectRef["country"]["status"] };
  },
  viewer: Viewer | null,
): boolean {
  return project.countryId === countryId && inPipeline(viewer, project);
}

/** Withdrawing: the investor who signed up, while it is active and before the deadline. */
export function canWithdrawSignup(
  viewer: Viewer | null,
  signup: { requesterId: string; status: MeetingSignupStatus },
  deadlinePassed: boolean,
): boolean {
  return (
    !deadlinePassed &&
    viewer !== null &&
    signup.requesterId === viewer.id &&
    signup.status === MeetingSignupStatus.ACTIVE
  );
}

/** The country-side list of sign-ups (and its CSV): admins, country users and WBG coordinators with a country. */
export function canViewSignupList(viewer: Viewer | null): boolean {
  return (
    isAdminViewer(viewer) ||
    ownCountryIds(viewer).length > 0 ||
    coordinatedCountryIds(viewer).length > 0
  );
}

/** Loading the countries' time blocks and their counterparts: admins only. */
export function canManageMeetingBlocks(viewer: Viewer | null): boolean {
  return isAdminViewer(viewer);
}
