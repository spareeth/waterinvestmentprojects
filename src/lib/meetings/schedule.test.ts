import { describe, expect, it } from "vitest";
import {
  formatClock,
  formatMeetingSlot,
  MEETING_SCHEDULE,
  plannedSlots,
  uaeDateKey,
  uaeTime,
} from "./schedule";

describe("meeting schedule", () => {
  it("has two rooms, 30-minute slots, 8 Dec full day, 9 Dec morning, 10 Dec full day", () => {
    expect(MEETING_SCHEDULE.rooms).toEqual(["Room A", "Room B"]);
    expect(MEETING_SCHEDULE.slotMinutes).toBe(30);
    expect(MEETING_SCHEDULE.days.map((d) => d.date)).toEqual([
      "2026-12-08",
      "2026-12-09",
      "2026-12-10",
    ]);
  });

  it("plans every slot in every room, in UAE time", () => {
    const slots = plannedSlots();
    // 8 Dec 09:00 to 17:00 = 16 slots, 9 Dec 09:00 to 13:00 = 8 slots, 10 Dec 09:00 to 17:00 = 16 slots; two rooms.
    expect(slots).toHaveLength((16 + 8 + 16) * 2);
    expect(slots[0]).toEqual({
      room: "Room A",
      startsAt: new Date("2026-12-08T05:00:00Z"),
      endsAt: new Date("2026-12-08T05:30:00Z"),
    });
    const last = slots.at(-1)!;
    expect(last.room).toBe("Room B");
    expect(formatClock(last.startsAt)).toBe("16:30");
    expect(formatClock(last.endsAt)).toBe("17:00");
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
