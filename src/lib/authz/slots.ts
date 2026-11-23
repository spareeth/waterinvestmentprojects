// Bilateral slot permissions (F10). Pure: no database access.
// Everyone with an active account may see the room grid, but a booking is shown in full only to admins, the
// investor who made the request, the country that owns the project and its WBG coordinators. Everyone else sees only "Booked":
// no request, project, country or investor, and a HELD slot looks the same as a BOOKED one.

import { MeetingRequestStatus, SlotStatus } from "@/generated/prisma/enums";
import {
  actsForCountry,
  coordinatesCountry,
  isAdminViewer,
  isOwnCountry,
  type Viewer,
} from "./viewer";

export interface SlotRef {
  id: string;
  roomId: string;
  startsAt: Date;
  endsAt: Date;
  status: SlotStatus;
  meetingRequestId: string | null;
  meetingRequest: {
    requesterId: string;
    project: { countryId: string };
  } | null;
}

/** What a viewer may know about a slot. `mine` is true when the details are theirs to see. */
export interface SlotView {
  id: string;
  roomId: string;
  startsAt: Date;
  endsAt: Date;
  status: SlotStatus;
  meetingRequestId: string | null;
  mine: boolean;
}

/** The select that slotView() needs. */
export const SLOT_POLICY_SELECT = {
  id: true,
  roomId: true,
  startsAt: true,
  endsAt: true,
  status: true,
  meetingRequestId: true,
  meetingRequest: {
    select: { requesterId: true, project: { select: { countryId: true } } },
  },
} as const;

export function canSeeSlotDetails(
  viewer: Viewer | null,
  slot: SlotRef,
): boolean {
  if (!viewer) return false;
  if (isAdminViewer(viewer)) return true;
  const request = slot.meetingRequest;
  if (!request) return false;
  return (
    request.requesterId === viewer.id ||
    isOwnCountry(viewer, request.project.countryId) ||
    coordinatesCountry(viewer, request.project.countryId)
  );
}

/** Redacts a slot for this viewer. Returns null for a viewer without an active account. */
export function slotView(
  viewer: Viewer | null,
  slot: SlotRef,
): SlotView | null {
  if (!viewer) return null;
  const base = {
    id: slot.id,
    roomId: slot.roomId,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
  };
  const taken = slot.status !== SlotStatus.OPEN || slot.meetingRequestId;
  if (!taken) {
    return {
      ...base,
      status: SlotStatus.OPEN,
      meetingRequestId: null,
      mine: false,
    };
  }
  if (canSeeSlotDetails(viewer, slot)) {
    return {
      ...base,
      status: slot.status,
      meetingRequestId: slot.meetingRequestId,
      mine: true,
    };
  }
  return {
    ...base,
    status: SlotStatus.BOOKED,
    meetingRequestId: null,
    mine: false,
  };
}

/**
 * The admin master calendar (23 Nov): every slot with the full booking details, blocking and unblocking free
 * slots, and cancelling meetings. Summit and platform admins only; countries, coordinators and investors never.
 */
export function canManageMeetingSchedule(viewer: Viewer | null): boolean {
  return isAdminViewer(viewer);
}

/** Blocking a slot: an admin, and only a free slot (no request holds it). */
export function canBlockSlot(
  viewer: Viewer | null,
  slot: { status: SlotStatus; meetingRequestId: string | null },
): boolean {
  return (
    canManageMeetingSchedule(viewer) &&
    slot.status === SlotStatus.OPEN &&
    slot.meetingRequestId === null
  );
}

/** Unblocking: an admin, and only a blocked slot. */
export function canUnblockSlot(
  viewer: Viewer | null,
  slot: { status: SlotStatus },
): boolean {
  return canManageMeetingSchedule(viewer) && slot.status === SlotStatus.BLOCKED;
}

/** Cancelling a meeting from the calendar: an admin, while the request is still open (awaiting or accepted). */
export function canCancelMeetingRequest(
  viewer: Viewer | null,
  request: { status: MeetingRequestStatus },
): boolean {
  return (
    canManageMeetingSchedule(viewer) &&
    (request.status === MeetingRequestStatus.PENDING ||
      request.status === MeetingRequestStatus.ACCEPTED)
  );
}

/** Assigning a slot to an ACCEPTED request: admins, or a user of the owning country. */
export function canBookSlot(
  viewer: Viewer | null,
  request: { status: MeetingRequestStatus; project: { countryId: string } },
): boolean {
  return (
    request.status === MeetingRequestStatus.ACCEPTED &&
    actsForCountry(viewer, request.project.countryId)
  );
}
