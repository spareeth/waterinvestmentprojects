// Bilateral meeting rooms and times (F9, PLAN v0.3): two rooms, 30-minute slots, UAE time. Rooms finalised 22 Nov:
// Room 1 - Al Jimi (22 people) and Room 2 - Shawka (10 people), both in use 09:00 to 19:00 on 8, 9 and 10 Dec (user decision,
// 22 Nov: the full room hours on every day, 9 Dec included, although the Summit runs from 15:30 that day).
// Pure, so the form, the server and tests share it. To add a day or change the hours, edit `days`: the missing
// slots are created the next time the schedule is read; slots already in the database are never removed.

export interface MeetingRoom {
  name: string;
  /** Number of people the room seats. */
  capacity: number;
  /** Earlier names of this room in the database, renamed on the next read so held and booked slots stay. */
  formerNames: readonly string[];
}

/**
 * Rooms finalised 22 Nov (Meeting room 1 and 2), named "Room 1 - Al Jimi" and "Room 2 - Shawka" (user, 22 Nov).
 * Room A and Room B were the placeholders, then "Al Jimi" and "Shawka" for a few hours: both are renamed.
 */
export const MEETING_ROOMS: readonly MeetingRoom[] = [
  {
    name: "Room 1 - Al Jimi",
    capacity: 22,
    formerNames: ["Room A", "Al Jimi"],
  },
  { name: "Room 2 - Shawka", capacity: 10, formerNames: ["Room B", "Shawka"] },
];

export interface MeetingDay {
  /** YYYY-MM-DD, UAE date. */
  date: string;
  /** HH:MM, UAE time. */
  from: string;
  to: string;
}

/** One start time on the request form. */
export interface MeetingTime {
  /** ISO start time, the value the form sends. */
  value: string;
  /** "09:30" */
  label: string;
  available: boolean;
}

/**
 * One slot of one room on the request calendar (22 Nov: a tab per room, with a legend). Who holds a slot is never
 * shown, only its state: free; pending (held by a request awaiting an answer); booked (confirmed); yours (held by
 * this investor); unavailable (the room is free but this investor or the country already meets then).
 */
export type RoomSlotState =
  "free" | "pending" | "booked" | "yours" | "unavailable";

export interface RoomSlotTime {
  /** The form value: roomSlotValue(start, room). */
  value: string;
  /** "09:30" */
  label: string;
  state: RoomSlotState;
}

export interface RoomDayTimes {
  key: string;
  label: string;
  times: RoomSlotTime[];
}

export interface RoomTimes {
  room: string;
  /** Number of people the room seats; 0 when not known. */
  capacity?: number;
  days: RoomDayTimes[];
}

/** "2026-12-08T05:00:00.000Z|Room 1 - Al Jimi": a start time in one room. */
export function roomSlotValue(startsAt: Date, room: string): string {
  return `${startsAt.toISOString()}|${room}`;
}

/** Reads a slot value: "ISO|Room" (one room) or a bare ISO time (any free room, as before 22 Nov). */
export function parseRoomSlotValue(
  value: string,
): { startsAt: Date; room: string | null } | null {
  const [time, ...rest] = value.trim().split("|");
  if (!time || Number.isNaN(Date.parse(time))) return null;
  const room = rest.join("|").trim();
  return { startsAt: new Date(time), room: room || null };
}

export interface MeetingDayTimes {
  key: string;
  /** "Tuesday 8 December" */
  label: string;
  times: MeetingTime[];
}

export const MEETING_SCHEDULE = {
  rooms: MEETING_ROOMS.map((r) => r.name) as readonly string[],
  slotMinutes: 30,
  days: [
    { date: "2026-12-08", from: "09:00", to: "19:00" },
    { date: "2026-12-09", from: "09:00", to: "19:00" },
    { date: "2026-12-10", from: "09:00", to: "19:00" },
  ] as readonly MeetingDay[],
} as const;

/** "Room 1 - Al Jimi (22 people) and Room 2 - Shawka (10 people)" */
export function describeMeetingRooms(
  rooms: readonly MeetingRoom[] = MEETING_ROOMS,
): string {
  const parts = rooms.map((r) => `${r.name} (${r.capacity} people)`);
  return parts.length > 1
    ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`
    : (parts[0] ?? "");
}

/** The UAE has no daylight saving time. */
const UAE_OFFSET = "+04:00";
export const UAE_TIME_ZONE = "Asia/Dubai";

export function uaeTime(date: string, time: string): Date {
  return new Date(`${date}T${time}:00${UAE_OFFSET}`);
}

export interface PlannedSlot {
  room: string;
  startsAt: Date;
  endsAt: Date;
}

/** Every slot of the schedule, room by room. */
export function plannedSlots(
  schedule: {
    rooms: readonly string[];
    slotMinutes: number;
    days: readonly MeetingDay[];
  } = MEETING_SCHEDULE,
): PlannedSlot[] {
  const step = schedule.slotMinutes * 60_000;
  const slots: PlannedSlot[] = [];
  for (const day of schedule.days) {
    const end = uaeTime(day.date, day.to).getTime();
    for (
      let t = uaeTime(day.date, day.from).getTime();
      t + step <= end;
      t += step
    ) {
      for (const room of schedule.rooms) {
        slots.push({ room, startsAt: new Date(t), endsAt: new Date(t + step) });
      }
    }
  }
  return slots;
}

const DAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: UAE_TIME_ZONE,
});
const CLOCK = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: UAE_TIME_ZONE,
});
const DAY_KEY = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "short",
  timeZone: UAE_TIME_ZONE,
});

/** "Tuesday 8 December" */
export function formatMeetingDay(date: Date): string {
  return DAY.format(date);
}

/** "09:30" (UAE time) */
export function formatClock(date: Date): string {
  return CLOCK.format(date);
}

/** "2026-12-08", the UAE date of an instant (to group slots by day). */
export function uaeDateKey(date: Date): string {
  return DAY_KEY.format(date);
}

/** "Tuesday 8 December, 09:30 to 10:00 (UAE time), Room A" */
export function formatMeetingSlot(slot: {
  startsAt: Date;
  endsAt: Date;
  room?: { name: string } | null;
}): string {
  const time = `${formatMeetingDay(slot.startsAt)}, ${formatClock(slot.startsAt)} to ${formatClock(slot.endsAt)} (UAE time)`;
  return slot.room ? `${time}, ${slot.room.name}` : time;
}

// ---------------------------------------------------------------------------
// 25 Nov (WBG, Jacob Kim): sign-ups by country instead of bookings
// ---------------------------------------------------------------------------

/**
 * Investors sign up to meet a country's delegation by ticking every time they could make, inside the country's
 * time blocks; the Summit team allocates one 20-minute meeting per sign-up after the deadline and confirms by
 * email. Times start every 30 minutes and are shown as 09:00–09:20, 09:30–09:50, so meetings can run over a
 * little without keeping the next party waiting. Rooms are never shown to investors.
 */
export const MEETING_SIGNUP = {
  slotMinutes: 30,
  meetingMinutes: 20,
  /** Sign-ups close at the end of 1 December, UAE time. */
  deadline: new Date("2026-12-01T23:59:59+04:00"),
  deadlineLabel: "1 December",
  confirmationLabel: "4 December",
} as const;

/**
 * The rooms a country's block can be in, by number as in WBG's time-block sheet (24 Nov): the two venue rooms and
 * the two hotel rooms WBG booked at the Pearl Rotana Capital Centre.
 */
export const BLOCK_ROOMS: readonly string[] = [
  MEETING_ROOMS[0].name,
  MEETING_ROOMS[1].name,
  "Room 3 - Hotel room A (Pearl Rotana)",
  "Room 4 - Hotel room B (Pearl Rotana)",
];

export function signupDeadlinePassed(now: Date = new Date()): boolean {
  return now.getTime() > MEETING_SIGNUP.deadline.getTime();
}

/** Every 30-minute start inside the blocks, in time order, without duplicates. */
export function blockSlotStarts(
  blocks: readonly { startsAt: Date; endsAt: Date }[],
): Date[] {
  const step = MEETING_SIGNUP.slotMinutes * 60_000;
  const starts = new Map<number, Date>();
  for (const block of blocks) {
    for (
      let t = block.startsAt.getTime();
      t + step <= block.endsAt.getTime();
      t += step
    ) {
      starts.set(t, new Date(t));
    }
  }
  return [...starts.values()].sort((a, b) => a.getTime() - b.getTime());
}

/** "09:00–09:20" (UAE time): the 20-minute meeting starting then. */
export function formatSignupSlot(startsAt: Date): string {
  const end = new Date(
    startsAt.getTime() + MEETING_SIGNUP.meetingMinutes * 60_000,
  );
  return `${formatClock(startsAt)}–${formatClock(end)}`;
}

/** "Tuesday 8 December, 09:00–09:20" */
export function formatSignupSlotWithDay(startsAt: Date): string {
  return `${formatMeetingDay(startsAt)}, ${formatSignupSlot(startsAt)}`;
}
