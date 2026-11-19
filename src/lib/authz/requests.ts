// Meeting request permissions (PLAN v0.3 F5, F6). Pure: no database access.
// A request is visible only to the investor who made it, the users of the country that owns the project, that
// country's WBG coordinators (read only) and admins. Countries never see other countries' requests; investors
// never see other investors' requests.

import type { Prisma } from "@/generated/prisma/client";
import { MeetingRequestStatus, UserRole } from "@/generated/prisma/enums";
import {
  actsForCountry,
  coordinatedCountryIds,
  coordinatesCountry,
  inPipeline,
  isAdminViewer,
  isOwnCountry,
  ownCountryIds,
  type ProjectRef,
  type Viewer,
} from "./viewer";

export interface MeetingRequestRef {
  requesterId: string;
  status: MeetingRequestStatus;
  project: { countryId: string };
}

/** Matches no request. */
export const NO_REQUEST: Prisma.MeetingRequestWhereInput = { id: { in: [] } };

export function meetingRequestWhere(
  viewer: Viewer | null,
): Prisma.MeetingRequestWhereInput {
  if (!viewer) return NO_REQUEST;
  if (isAdminViewer(viewer)) return {};
  const countries = [
    ...ownCountryIds(viewer),
    ...coordinatedCountryIds(viewer),
  ];
  if (countries.length === 0) return { requesterId: viewer.id };
  return {
    OR: [
      { requesterId: viewer.id },
      { project: { countryId: { in: countries } } },
    ],
  };
}

export function canViewMeetingRequest(
  viewer: Viewer | null,
  request: MeetingRequestRef,
): boolean {
  if (!viewer) return false;
  return (
    isAdminViewer(viewer) ||
    request.requesterId === viewer.id ||
    isOwnCountry(viewer, request.project.countryId) ||
    coordinatesCountry(viewer, request.project.countryId)
  );
}

/** Investors request a meeting on a project in the pipeline (no ranking, no limit). */
export function canRequestMeeting(
  viewer: Viewer | null,
  project: ProjectRef,
): boolean {
  return viewer?.role === UserRole.INVESTOR && inPipeline(viewer, project);
}

/**
 * Accept or decline: any user of the owning country (user decision, 18 Nov), or an admin on its behalf.
 * PENDING only. WBG coordinators read but never decide.
 */
export function canDecideMeetingRequest(
  viewer: Viewer | null,
  request: MeetingRequestRef,
): boolean {
  return (
    request.status === MeetingRequestStatus.PENDING &&
    actsForCountry(viewer, request.project.countryId)
  );
}

/** Countries whose request inbox the viewer sees: own countries (COUNTRY) or coordinated ones (WBG_COORDINATOR). */
function inboxCountryIds(viewer: Viewer | null): string[] {
  return [...ownCountryIds(viewer), ...coordinatedCountryIds(viewer)];
}

/**
 * The country-side inbox: requests on projects of the viewer's countries. Admins: all. COUNTRY and
 * WBG_COORDINATOR users: their countries'. Everyone else (investors included): none. An investor's own
 * requests are listed with meetingRequestWhere, not here.
 */
export function requestInboxWhere(
  viewer: Viewer | null,
): Prisma.MeetingRequestWhereInput {
  if (!viewer) return NO_REQUEST;
  if (isAdminViewer(viewer)) return {};
  const countries = inboxCountryIds(viewer);
  if (countries.length === 0) return NO_REQUEST;
  return { project: { countryId: { in: countries } } };
}

/** Admins, and country users or WBG coordinators with at least one country. */
export function canViewRequestInbox(viewer: Viewer | null): boolean {
  return isAdminViewer(viewer) || inboxCountryIds(viewer).length > 0;
}

/**
 * CSV export of meeting requests (the request list doubles as a contact list, PLAN 0.9): whoever has an inbox
 * (user decision, 18 Nov, via M5: coordinators may export their own countries). Scope the exported rows with
 * requestInboxWhere(viewer).
 */
export function canExportMeetingRequests(viewer: Viewer | null): boolean {
  return canViewRequestInbox(viewer);
}

/** "My requests" page: investors only. Rows come from meetingRequestWhere(viewer). */
export function canListOwnMeetingRequests(viewer: Viewer | null): boolean {
  return viewer?.role === UserRole.INVESTOR;
}

/** The requester may withdraw a request that is still pending or already accepted. */
export function canWithdrawMeetingRequest(
  viewer: Viewer | null,
  request: MeetingRequestRef,
): boolean {
  return (
    viewer !== null &&
    request.requesterId === viewer.id &&
    (request.status === MeetingRequestStatus.PENDING ||
      request.status === MeetingRequestStatus.ACCEPTED)
  );
}
