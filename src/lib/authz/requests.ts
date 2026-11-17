// Meeting and information request permissions (F7, F8). Pure: no database access.
// A request is visible only to the investor who made it, the country that owns the project, and admins.

import type { Prisma } from "@/generated/prisma/client";
import { MeetingRequestStatus, UserRole } from "@/generated/prisma/enums";
import {
  actsForCountry,
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
  const own = ownCountryIds(viewer);
  if (own.length === 0) return { requesterId: viewer.id };
  return {
    OR: [{ requesterId: viewer.id }, { project: { countryId: { in: own } } }],
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
    isOwnCountry(viewer, request.project.countryId)
  );
}

/** Investors ask for a meeting or more information on a project in their pipeline. */
export function canRequestMeeting(
  viewer: Viewer | null,
  project: ProjectRef,
): boolean {
  return viewer?.role === UserRole.INVESTOR && inPipeline(viewer, project);
}

/** Accept or decline: the focal point of the owning country, or an admin on its behalf. PENDING only. */
export function canDecideMeetingRequest(
  viewer: Viewer | null,
  request: MeetingRequestRef,
): boolean {
  return (
    request.status === MeetingRequestStatus.PENDING &&
    actsForCountry(viewer, request.project.countryId)
  );
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
