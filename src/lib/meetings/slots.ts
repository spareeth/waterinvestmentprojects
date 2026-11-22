import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { MeetingRequestStatus, SlotStatus } from "@/generated/prisma/enums";
import { canUseAdminConsole, type Viewer } from "@/lib/authz";
import { db } from "@/lib/db";
import { RequestError } from "@/lib/requests/errors";
import {
  formatClock,
  formatMeetingDay,
  MEETING_SCHEDULE,
  type MeetingDayTimes,
  plannedSlots,
  type RoomSlotState,
  type RoomTimes,
  roomSlotValue,
  uaeDateKey,
} from "./schedule";

// Bilateral meeting slots (F9). The investor chooses a time when requesting a meeting; the portal holds the first
// free room at that time (HELD) until the country answers: accepted makes it BOOKED, declined or withdrawn frees it
// again. Nobody can hold two meetings at the same time: neither the investor nor the country (one delegation).
// Every change runs inside the caller's transaction under one advisory lock, so two requests cannot take the
// same slot. Rooms and slots come from MEETING_SCHEDULE (src/lib/meetings/schedule.ts).

const SLOT_LOCK = "meeting-slots";
/** A room's size is not known yet (MoFA/BCG); 0 means "not set". */
const UNKNOWN_CAPACITY = 0;

let ensured: Promise<void> | null = null;

/** Creates the rooms and slots of MEETING_SCHEDULE that are missing. Runs once per server process. */
export function ensureSchedule(): Promise<void> {
  ensured ??= createMissingSlots().catch((error) => {
    ensured = null;
    throw error;
  });
  return ensured;
}

async function createMissingSlots(): Promise<void> {
  const planned = plannedSlots();
  if (planned.length === 0) return;
  const rooms = new Map<string, string>();
  for (const name of MEETING_SCHEDULE.rooms) {
    const room = await db.room.upsert({
      where: { name },
      create: { name, capacity: UNKNOWN_CAPACITY },
      update: {},
      select: { id: true },
    });
    rooms.set(name, room.id);
  }
  await db.slot.createMany({
    data: planned.map((s) => ({
      roomId: rooms.get(s.room)!,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
    })),
    skipDuplicates: true,
  });
}

/** Slots taken by a request that is still open (pending or accepted). */
const TAKEN = {
  meetingRequestId: { not: null },
} satisfies Prisma.SlotWhereInput;

export type { MeetingDayTimes, MeetingTime, RoomTimes } from "./schedule";

/**
 * The request calendar, room by room (22 Nov): every future slot of each room with its state for this investor
 * and this project's country. Never says who holds a slot.
 */
export async function listRoomTimes(
  requesterId: string,
  countryId: string,
  now: Date = new Date(),
): Promise<RoomTimes[]> {
  await ensureSchedule();
  const slots = await db.slot.findMany({
    where: { startsAt: { gt: now } },
    orderBy: [{ room: { name: "asc" } }, { startsAt: "asc" }],
    select: {
      startsAt: true,
      status: true,
      meetingRequestId: true,
      room: { select: { name: true } },
      meetingRequest: {
        select: { requesterId: true, project: { select: { countryId: true } } },
      },
    },
  });
  // Times at which this investor or this country already has a meeting, in any room.
  const busy = new Set(
    slots
      .filter(
        (s) =>
          s.meetingRequest &&
          (s.meetingRequest.requesterId === requesterId ||
            s.meetingRequest.project.countryId === countryId),
      )
      .map((s) => s.startsAt.getTime()),
  );
  const rooms = new Map<string, RoomTimes>();
  for (const s of slots) {
    let room = rooms.get(s.room.name);
    if (!room) {
      room = { room: s.room.name, days: [] };
      rooms.set(s.room.name, room);
    }
    const key = uaeDateKey(s.startsAt);
    let day = room.days.find((d) => d.key === key);
    if (!day) {
      day = { key, label: formatMeetingDay(s.startsAt), times: [] };
      room.days.push(day);
    }
    let state: RoomSlotState;
    if (!s.meetingRequestId) {
      state = busy.has(s.startsAt.getTime()) ? "unavailable" : "free";
    } else if (s.meetingRequest?.requesterId === requesterId) {
      state = "yours";
    } else {
      state = s.status === SlotStatus.BOOKED ? "booked" : "pending";
    }
    day.times.push({
      value: roomSlotValue(s.startsAt, s.room.name),
      label: formatClock(s.startsAt),
      state,
    });
  }
  return [...rooms.values()];
}

/**
 * The times an investor can choose for a meeting on a project of this country: every future start time, marked
 * available when a room is free and neither the investor nor the country has a meeting then.
 */
export async function listMeetingTimes(
  requesterId: string,
  countryId: string,
  now: Date = new Date(),
): Promise<MeetingDayTimes[]> {
  await ensureSchedule();
  const slots = await db.slot.findMany({
    where: { startsAt: { gt: now } },
    orderBy: [{ startsAt: "asc" }],
    select: {
      startsAt: true,
      meetingRequestId: true,
      meetingRequest: {
        select: { requesterId: true, project: { select: { countryId: true } } },
      },
    },
  });
  const byStart = new Map<
    number,
    { startsAt: Date; free: boolean; clash: boolean }
  >();
  for (const s of slots) {
    const key = s.startsAt.getTime();
    const entry = byStart.get(key) ?? {
      startsAt: s.startsAt,
      free: false,
      clash: false,
    };
    if (!s.meetingRequestId) entry.free = true;
    const r = s.meetingRequest;
    if (
      r &&
      (r.requesterId === requesterId || r.project.countryId === countryId)
    ) {
      entry.clash = true;
    }
    byStart.set(key, entry);
  }
  const days = new Map<string, MeetingDayTimes>();
  for (const entry of byStart.values()) {
    const key = uaeDateKey(entry.startsAt);
    let day = days.get(key);
    if (!day) {
      day = { key, label: formatMeetingDay(entry.startsAt), times: [] };
      days.set(key, day);
    }
    day.times.push({
      value: entry.startsAt.toISOString(),
      label: formatClock(entry.startsAt),
      available: entry.free && !entry.clash,
    });
  }
  return [...days.values()];
}

/**
 * Holds the chosen room (or the first free room) at `startsAt` for a new request. Refuses with "slot_taken" when
 * that room (or every room) is taken then,
 * or when the investor or the country already has a meeting at that time. Call inside the request transaction.
 */
export async function holdSlot(
  tx: Prisma.TransactionClient,
  request: { id: string; requesterId: string; countryId: string },
  startsAt: Date,
  now: Date,
  /** The room chosen on the calendar (22 Nov); null takes the first free room. */
  room: string | null = null,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${SLOT_LOCK}))`;
  if (startsAt.getTime() <= now.getTime()) throw new RequestError("slot_taken");
  const clash = await tx.slot.count({
    where: {
      startsAt,
      ...TAKEN,
      meetingRequest: {
        OR: [
          { requesterId: request.requesterId },
          { project: { countryId: request.countryId } },
        ],
      },
    },
  });
  if (clash > 0) throw new RequestError("slot_taken");
  // A slot is free when no request holds it (its status then is OPEN; the id is what counts).
  const free = await tx.slot.findFirst({
    where: {
      startsAt,
      meetingRequestId: null,
      ...(room ? { room: { name: room } } : {}),
    },
    orderBy: { room: { name: "asc" } },
    select: { id: true },
  });
  if (!free) throw new RequestError("slot_taken");
  const { count } = await tx.slot.updateMany({
    where: { id: free.id, meetingRequestId: null },
    data: { status: SlotStatus.HELD, meetingRequestId: request.id },
  });
  if (count !== 1) throw new RequestError("slot_taken");
}

/** Accepted: the held slot becomes a booked meeting. */
export async function bookHeldSlot(
  tx: Prisma.TransactionClient,
  requestId: string,
): Promise<void> {
  await tx.slot.updateMany({
    where: { meetingRequestId: requestId, status: SlotStatus.HELD },
    data: { status: SlotStatus.BOOKED },
  });
}

/** Declined or withdrawn: the slot is free again. */
export async function releaseSlot(
  tx: Prisma.TransactionClient,
  requestId: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${SLOT_LOCK}))`;
  await tx.slot.updateMany({
    where: { meetingRequestId: requestId },
    data: { status: SlotStatus.OPEN, meetingRequestId: null },
  });
}

/** What a slot carries for display: its time and room. */
export const SLOT_DISPLAY_SELECT = {
  startsAt: true,
  endsAt: true,
  status: true,
  room: { select: { name: true } },
} satisfies Prisma.SlotSelect;

// ---------------------------------------------------------------------------
// Admin: the room schedule
// ---------------------------------------------------------------------------

const SCHEDULE_SELECT = {
  id: true,
  startsAt: true,
  endsAt: true,
  status: true,
  room: { select: { id: true, name: true } },
  meetingRequest: {
    select: {
      id: true,
      status: true,
      organisation: true,
      contactName: true,
      requester: { select: { name: true } },
      project: {
        select: { title: true, country: { select: { name: true } } },
      },
    },
  },
} satisfies Prisma.SlotSelect;

export type ScheduleSlot = Prisma.SlotGetPayload<{
  select: typeof SCHEDULE_SELECT;
}>;

export interface ScheduleDay {
  key: string;
  label: string;
  rooms: { id: string; name: string }[];
  rows: {
    startsAt: Date;
    endsAt: Date;
    label: string;
    cells: (ScheduleSlot | null)[];
  }[];
  held: number;
  booked: number;
}

/** Admins: every day of the schedule as a grid of start times by room. Empty for anyone else. */
export async function getMeetingSchedule(
  viewer: Viewer,
): Promise<ScheduleDay[]> {
  if (!canUseAdminConsole(viewer)) return [];
  await ensureSchedule();
  const slots = await db.slot.findMany({
    orderBy: [{ startsAt: "asc" }, { room: { name: "asc" } }],
    select: SCHEDULE_SELECT,
  });
  const rooms = [
    ...new Map(slots.map((s) => [s.room.id, s.room])).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));
  const days = new Map<string, ScheduleDay>();
  for (const slot of slots) {
    const key = uaeDateKey(slot.startsAt);
    let day = days.get(key);
    if (!day) {
      day = {
        key,
        label: formatMeetingDay(slot.startsAt),
        rooms,
        rows: [],
        held: 0,
        booked: 0,
      };
      days.set(key, day);
    }
    let row = day.rows.find(
      (r) => r.startsAt.getTime() === slot.startsAt.getTime(),
    );
    if (!row) {
      row = {
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        label: `${formatClock(slot.startsAt)} to ${formatClock(slot.endsAt)}`,
        cells: rooms.map(() => null),
      };
      day.rows.push(row);
    }
    row.cells[rooms.findIndex((r) => r.id === slot.room.id)] = slot;
    if (slot.meetingRequest?.status === MeetingRequestStatus.ACCEPTED)
      day.booked++;
    else if (slot.meetingRequest) day.held++;
  }
  return [...days.values()];
}
