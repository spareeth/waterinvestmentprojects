"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { requestMetaFrom } from "@/lib/audit";
import { requireViewer } from "@/lib/authz";
import {
  blockSlot,
  blockTimes,
  SCHEDULE_MESSAGES,
  ScheduleError,
  unblockSlot,
} from "@/lib/meetings/manage";
import { REQUEST_MESSAGES } from "@/lib/requests/errors";
import { cancelMeetingRequest, RequestError } from "@/lib/requests/service";

// Admin master calendar (23 Nov): block and unblock slots, cancel meetings. Each action gets the Viewer itself;
// the services decide through src/lib/authz (canManageMeetingSchedule and friends) and write the audit trail.

export interface CalendarActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
}

async function meta() {
  return requestMetaFrom(await headers());
}

function scheduleRefused(error: unknown): CalendarActionState {
  if (!(error instanceof ScheduleError)) throw error;
  return {
    error:
      error.code === "invalid"
        ? (Object.values(error.fieldErrors)[0] ?? SCHEDULE_MESSAGES.invalid)
        : SCHEDULE_MESSAGES[error.code],
    fieldErrors: error.fieldErrors,
  };
}

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function blockTimesAction(
  formData: FormData,
): Promise<CalendarActionState> {
  const viewer = await requireViewer();
  try {
    const result = await blockTimes(
      viewer,
      {
        date: text(formData, "date"),
        from: text(formData, "from"),
        to: text(formData, "to"),
        roomId: text(formData, "roomId") || null,
        reason: text(formData, "reason"),
      },
      { meta: await meta() },
    );
    refresh();
    const blocked = `${result.blocked} ${result.blocked === 1 ? "time" : "times"} blocked.`;
    return {
      success:
        result.skipped > 0
          ? `${blocked} ${result.skipped} left as they were (a meeting holds them, or they were already blocked).`
          : blocked,
    };
  } catch (error) {
    return scheduleRefused(error);
  }
}

export async function blockSlotAction(
  slotId: string,
  reason: string,
): Promise<CalendarActionState> {
  const viewer = await requireViewer();
  try {
    await blockSlot(viewer, slotId, reason, { meta: await meta() });
  } catch (error) {
    return scheduleRefused(error);
  }
  refresh();
  return { success: "Time blocked." };
}

export async function unblockSlotAction(
  slotId: string,
): Promise<CalendarActionState> {
  const viewer = await requireViewer();
  try {
    await unblockSlot(viewer, slotId, { meta: await meta() });
  } catch (error) {
    return scheduleRefused(error);
  }
  refresh();
  return { success: "Time free again." };
}

export async function cancelMeetingAction(
  requestId: string,
  reason: string,
): Promise<CalendarActionState> {
  const viewer = await requireViewer();
  try {
    await cancelMeetingRequest(viewer, requestId, reason, {
      meta: await meta(),
    });
  } catch (error) {
    if (!(error instanceof RequestError)) throw error;
    return {
      error:
        error.code === "not_open"
          ? "This meeting has already been cancelled, withdrawn or declined. Reload the page to see the calendar as it is now."
          : REQUEST_MESSAGES[error.code],
    };
  }
  refresh();
  return {
    success:
      "Meeting cancelled. The investor, the country and the Summit mailbox are told.",
  };
}
