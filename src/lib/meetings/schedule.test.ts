import { describe, expect, it } from "vitest";
import {
  describeMeetingRooms,
  formatClock,
  formatMeetingSlot,
  MEETING_ROOMS,
  MEETING_SCHEDULE,
  plannedSlots,
  uaeDateKey,
  uaeTime,
} from "./schedule";

describe("meeting schedule", () => {
  it("has the two rooms finalised on 22 Nov, 30-minute slots, 09:00 to 19:00 on 8, 9 and 10 Dec", () => {
    expect(MEETING_ROOMS).toEqual([
      { name: "Al Jimi", capacity: 22, formerNames: ["Room A"] },
      { name: "Shawka", capacity: 10, formerNames: ["Room B"] },
    ]);
    expect(MEETING_SCHEDULE.rooms).toEqual(["Al Jimi", "Shawka"]);
    expect(MEETING_SCHEDULE.slotMinutes).toBe(30);
    expect(MEETING_SCHEDULE.days).toEqual([
      { date: "2026-12-08", from: "09:00", to: "19:00" },
      { date: "2026-12-09", from: "09:00", to: "19:00" },
      { date: "2026-12-10", from: "09:00", to: "19:00" },
    ]);
    expect(describeMeetingRooms()).toBe(
      "Al Jimi (22 people) and Shawka (10 people)",
    );
  });

  it("plans every slot in every room, in UAE time", () => {
    const slots = plannedSlots();
    // 8 Dec 09:00 to 19:00 = 20 slots, 9 Dec 09:00 to 19:00 = 20 slots, 10 Dec 09:00 to 19:00 = 20 slots; two rooms.
    expect(slots).toHaveLength((20 + 20 + 20) * 2);
    expect(slots[0]).toEqual({
      room: "Al Jimi",
      startsAt: new Date("2026-12-08T05:00:00Z"),
      endsAt: new Date("2026-12-08T05:30:00Z"),
    });
    const last = slots.at(-1)!;
    expect(last.room).toBe("Shawka");
    expect(formatClock(last.startsAt)).toBe("18:30");
    expect(formatClock(last.endsAt)).toBe("19:00");
  });

  it("drops a slot that would run past the end of the day", () => {
    const slots = plannedSlots({
      rooms: ["X"],
      slotMinutes: 45,
      days: [{ date: "2026-12-10", from: "09:00", to: "10:00" }],
    });
    expect(slots).toHaveLength(1);
  });

  it("formats times for people", () => {
    const startsAt = uaeTime("2026-12-08", "09:30");
    const endsAt = uaeTime("2026-12-08", "10:00");
    expect(uaeDateKey(startsAt)).toBe("2026-12-08");
    expect(
      formatMeetingSlot({ startsAt, endsAt, room: { name: "Room A" } }),
    ).toBe("Tuesday 8 December, 09:30 to 10:00 (UAE time), Room A");
  });
});
