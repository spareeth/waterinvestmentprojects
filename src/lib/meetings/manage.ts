import "server-only";
import { SlotStatus } from "@/generated/prisma/enums";
import { type RequestMeta, writeAudit } from "@/lib/audit";
import {
  canBlockSlot,
  canManageMeetingSchedule,
  canUnblockSlot,
  type Viewer,
} from "@/lib/authz";
import { db } from "@/lib/db";
import { MEETING_SCHEDULE, uaeTime } from "./schedule";
import { ensureSchedule, lockSlots } from "./slots";

// Admin master calendar (23 Nov, Sajid): the Summit team blocks free slots (for example during the Summit itself)
// and unblocks them again. A blocked slot is never offered to investors and holdSlot never takes it. Slots that a
// request holds are left alone: cancel the meeting first. Every change is checked through src/lib/authz and audited.
// Cancelling a meeting lives with the other request changes (cancelMeetingRequest in src/lib/requests/service.ts).

export const SLOT_AUDIT = {
  BLOCK: "slot.block",
  UNBLOCK: "slot.unblock",
} as const;

export const MAX_BLOCK_REASON = 200;

export type ScheduleErrorCode = "forbidden" | "not_found" | "invalid";

export class ScheduleError extends Error {
  constructor(
    public readonly code: ScheduleErrorCode,
    public readonly fieldErrors: Record<string, string> = {},
  ) {
    super(`Schedule change refused: ${code}`);
    this.name = "ScheduleError";
  }
}

export const SCHEDULE_MESSAGES: Record<ScheduleErrorCode, string> = {
  forbidden: "You do not have permission to do this.",
  not_found:
    "This time has changed in the meantime. Reload the page to see the calendar as it is now.",
  invalid: "Check the highlighted fields and try again.",
};

export interface BlockTimesInput {
  /** YYYY-MM-DD, a day of the schedule (UAE date). */
  date: string;
  /** HH:MM, UAE time; the first start time to block. */
  from: string;
  /** HH:MM, UAE time; blocks every slot starting before this time. */
  to: string;
  /** One room's id, or null for every room. */
  roomId: string | null;
  reason: string;
}

export interface BlockResult {
  blocked: number;
  /** Slots in the range that a request holds or that were already blocked: left as they were. */
  skipped: number;
}

interface ChangeOptions {
  meta?: RequestMeta;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Checks a range from the "Block times" form. Pure, so the form and tests share it. */
export function parseBlockTimes(
  input: BlockTimesInput,
):
  | { ok: true; startsFrom: Date; startsBefore: Date; reason: string }
  | { ok: false; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};
  if (!MEETING_SCHEDULE.days.some((d) => d.date === input.date)) {
    fieldErrors.date = "Choose a day of the meeting schedule.";
  }
  if (!TIME.test(input.from)) fieldErrors.from = "Choose a start time.";
  if (!TIME.test(input.to)) fieldErrors.to = "Choose an end time.";
  if (!fieldErrors.from && !fieldErrors.to && input.from >= input.to) {
    fieldErrors.to = "The end time must be after the start time.";
  }
  const reason = input.reason.trim().replace(/\s+/g, " ");
  if (reason.length > MAX_BLOCK_REASON) {
    fieldErrors.reason = `Keep the reason to ${MAX_BLOCK_REASON} characters.`;
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return {
    ok: true,
    startsFrom: uaeTime(input.date, input.from),
    startsBefore: uaeTime(input.date, input.to),
    reason,
  };
}

/** Blocks every free slot in a time range of one day, in one room or in all of them. */
export async function blockTimes(
  viewer: Viewer,
  input: BlockTimesInput,
  options: ChangeOptions = {},
): Promise<BlockResult> {
  if (!canManageMeetingSchedule(viewer)) throw new ScheduleError("forbidden");
  const parsed = parseBlockTimes(input);
  if (!parsed.ok) throw new ScheduleError("invalid", parsed.fieldErrors);
  await ensureSchedule();
  return db.$transaction(async (tx) => {
    await lockSlots(tx);
    const inRange = await tx.slot.findMany({
      where: {
        startsAt: { gte: parsed.startsFrom, lt: parsed.startsBefore },
        ...(input.roomId ? { roomId: input.roomId } : {}),
      },
      select: {
        id: true,
        status: true,
        meetingRequestId: true,
        startsAt: true,
        room: { select: { name: true } },
      },
    });
    if (input.roomId && inRange.length === 0) {
      throw new ScheduleError("invalid", { roomId: "Choose a room." });
    }
    const free = inRange.filter((s) => canBlockSlot(viewer, s));
    for (const slot of free) {
      await tx.slot.update({
        where: { id: slot.id },
        data: {
          status: SlotStatus.BLOCKED,
          blockedReason: parsed.reason || null,
        },
      });
      await writeAudit(
        {
          actorId: viewer.id,
          action: SLOT_AUDIT.BLOCK,
          entityType: "Slot",
          entityId: slot.id,
          meta: options.meta,
          metadata: {
            room: slot.room.name,
            startsAt: slot.startsAt.toISOString(),
            reason: parsed.reason,
          },
        },
        tx,
      );
    }
    return { blocked: free.length, skipped: inRange.length - free.length };
  });
}

/** Blocks one free slot (the "Block" button on a calendar cell). */
export async function blockSlot(
  viewer: Viewer,
  slotId: string,
  reason: string,
  options: ChangeOptions = {},
): Promise<void> {
  if (!canManageMeetingSchedule(viewer)) throw new ScheduleError("forbidden");
  const clean = reason.trim().replace(/\s+/g, " ");
  if (clean.length > MAX_BLOCK_REASON) {
    throw new ScheduleError("invalid", {
      reason: `Keep the reason to ${MAX_BLOCK_REASON} characters.`,
    });
  }
  await db.$transaction(async (tx) => {
    await lockSlots(tx);
    const slot = await tx.slot.findUnique({
      where: { id: slotId },
      select: {
        id: true,
        status: true,
        meetingRequestId: true,
        startsAt: true,
        room: { select: { name: true } },
      },
    });
    if (!slot || !canBlockSlot(viewer, slot)) {
      throw new ScheduleError("not_found");
    }
    await tx.slot.update({
      where: { id: slot.id },
      data: { status: SlotStatus.BLOCKED, blockedReason: clean || null },
    });
    await writeAudit(
      {
        actorId: viewer.id,
        action: SLOT_AUDIT.BLOCK,
        entityType: "Slot",
        entityId: slot.id,
        meta: options.meta,
        metadata: {
          room: slot.room.name,
          startsAt: slot.startsAt.toISOString(),
          reason: clean,
        },
      },
      tx,
    );
  });
}

/** Frees a blocked slot again. */
export async function unblockSlot(
  viewer: Viewer,
  slotId: string,
  options: ChangeOptions = {},
): Promise<void> {
  if (!canManageMeetingSchedule(viewer)) throw new ScheduleError("forbidden");
  await db.$transaction(async (tx) => {
    await lockSlots(tx);
    const slot = await tx.slot.findUnique({
      where: { id: slotId },
      select: {
        id: true,
        status: true,
        blockedReason: true,
        startsAt: true,
        room: { select: { name: true } },
      },
    });
    if (!slot || !canUnblockSlot(viewer, slot)) {
      throw new ScheduleError("not_found");
    }
    await tx.slot.update({
      where: { id: slot.id },
      data: { status: SlotStatus.OPEN, blockedReason: null },
    });
    await writeAudit(
      {
        actorId: viewer.id,
        action: SLOT_AUDIT.UNBLOCK,
        entityType: "Slot",
        entityId: slot.id,
        meta: options.meta,
        metadata: {
          room: slot.room.name,
          startsAt: slot.startsAt.toISOString(),
          previousReason: slot.blockedReason ?? "",
        },
      },
      tx,
    );
  });
}
