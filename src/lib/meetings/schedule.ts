// Bilateral meeting rooms and times (F9, PLAN v0.3): two rooms, 30-minute slots, 8 Dec full day, 9 Dec morning
// (the Summit itself is on 9 Dec from 15:30) and 10 Dec full day. Hours 09:00 to 17:00 UAE time (user decisions,
// 20 Nov). Pure, so the form, the server and tests share it. To add a day or change the hours, edit DAYS: the
// missing slots are created the next time the schedule is read; slots already in the database are never removed.

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
  days: RoomDayTimes[];
}

/** "2026-12-08T05:00:00.000Z|Room A": a start time in one room. */
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
  rooms: ["Room A", "Room B"] as readonly string[],
  slotMinutes: 30,
  days: [
    { date: "2026-12-08", from: "09:00", to: "17:00" },
    { date: "2026-12-09", from: "09:00", to: "13:00" },
    { date: "2026-12-10", from: "09:00", to: "17:00" },
  ] as readonly MeetingDay[],
} as const;

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
