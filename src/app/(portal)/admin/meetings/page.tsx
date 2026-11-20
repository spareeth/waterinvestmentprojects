import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import {
  tableFrameClass,
  tableHeadClass,
  tableRowClass,
} from "@/components/ui/table-styles";
import { MeetingRequestStatus } from "@/generated/prisma/enums";
import { canUseWorkspace, requirePortalUser } from "@/lib/authz";
import { canUseAdminConsole } from "@/lib/authz/admin";
import { MEETING_SCHEDULE } from "@/lib/meetings/schedule";
import { getMeetingSchedule, type ScheduleSlot } from "@/lib/meetings/slots";

// Reads the session and the database on the server before rendering, so it may block.
export const instant = false;

export const metadata: Metadata = { title: "Meeting schedule" };

/**
 * Admin: the bilateral meeting rooms (F9) as a grid of 30-minute times by room, per day. A time an investor chose
 * is "Awaiting country" until the focal point accepts (then "Booked"); declined and withdrawn requests free it.
 */
export default async function MeetingSchedulePage() {
  const { user, viewer } = await requirePortalUser();
  if (!canUseAdminConsole(viewer)) notFound();
  const days = await getMeetingSchedule(viewer);

  return (
    <AdminShell
      name={user.name}
      showWorkspace={canUseWorkspace(viewer)}
      current="/admin/meetings"
      title="Meeting schedule"
      intro={`Bilateral meetings in ${MEETING_SCHEDULE.rooms.join(" and ")}, ${MEETING_SCHEDULE.slotMinutes} minutes each, UAE time. Investors choose a time when they request a meeting; it is held until the country answers.`}
    >
      {days.length === 0 ? (
        <p className="rounded-xl border bg-card p-6 text-muted-foreground">
          No meeting times are set up.
        </p>
      ) : (
        days.map((day) => (
          <section
            key={day.key}
            aria-labelledby={`day-${day.key}`}
            className="flex flex-col gap-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2
                id={`day-${day.key}`}
                className="text-lg font-semibold text-brand-navy"
              >
                {day.label}
              </h2>
              <p className="text-sm text-muted-foreground">
                {day.booked} booked · {day.held} awaiting country ·{" "}
                {day.rows.length * day.rooms.length - day.booked - day.held}{" "}
                free
              </p>
            </div>
            <div className={tableFrameClass}>
              <table className="w-full min-w-[44rem] text-sm">
                <thead className={tableHeadClass}>
                  <tr>
                    <th scope="col" className="w-36 px-4 py-3 text-left">
                      Time
                    </th>
                    {day.rooms.map((room) => (
                      <th
                        key={room.id}
                        scope="col"
                        className="px-4 py-3 text-left"
                      >
                        {room.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {day.rows.map((row, i) => (
                    <tr
                      key={row.startsAt.toISOString()}
                      className={tableRowClass(i)}
                    >
                      <th
                        scope="row"
                        className="px-4 py-2 text-left font-medium whitespace-nowrap text-water-800"
                      >
                        {row.label}
                      </th>
                      {row.cells.map((slot, j) => (
                        <td key={j} className="px-4 py-2 align-top">
                          <SlotCell slot={slot} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </AdminShell>
  );
}

function SlotCell({ slot }: { slot: ScheduleSlot | null }) {
  const request = slot?.meetingRequest;
  if (!request) {
    return <span className="text-muted-foreground">Free</span>;
  }
  const booked = request.status === MeetingRequestStatus.ACCEPTED;
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={
          booked
            ? "w-fit rounded-full bg-water-100 px-2 py-0.5 text-xs font-semibold text-water-800"
            : "w-fit rounded-full bg-sand-100 px-2 py-0.5 text-xs font-semibold text-sand-700"
        }
      >
        {booked ? "Booked" : "Awaiting country"}
      </span>
      <span className="font-medium">
        {request.project.country.name}: {request.project.title}
      </span>
      <span className="text-muted-foreground">
        {request.contactName || request.requester.name}, {request.organisation}
      </span>
    </div>
  );
}
