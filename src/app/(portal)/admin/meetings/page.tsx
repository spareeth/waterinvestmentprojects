import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import {
  BlockTimesForm,
  SlotActions,
} from "@/components/admin/meeting-calendar";
import { MeetingViewsNav } from "@/components/admin/meeting-views-nav";
import {
  tableFrameClass,
  tableHeadClass,
  tableRowClass,
} from "@/components/ui/table-styles";
import { MeetingRequestStatus, SlotStatus } from "@/generated/prisma/enums";
import { canManageMeetingSchedule, requirePortalUser } from "@/lib/authz";
import {
  describeMeetingRooms,
  formatClock,
  MEETING_SCHEDULE,
} from "@/lib/meetings/schedule";
import { getMeetingSchedule, type ScheduleSlot } from "@/lib/meetings/slots";
import { formatUaeTime } from "@/lib/submission/format";
import { cn } from "@/lib/utils";

// Reads the session and the database on the server before rendering, so it may block.
export const instant = false;

export const metadata: Metadata = { title: "Meeting calendar" };

/**
 * Admin master calendar (23 Nov, replacing the read-only grid of F9): one day at a time, every 30-minute time by
 * room, with the full details of each request or meeting, the free and blocked times, and the controls to block
 * and unblock times and to cancel meetings. Admins only (canManageMeetingSchedule); every action is checked again
 * on the server.
 */
export default async function MeetingSchedulePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user, viewer } = await requirePortalUser();
  if (!canManageMeetingSchedule(viewer)) notFound();
  const days = await getMeetingSchedule(viewer);
  const params = await searchParams;
  const asked = typeof params.day === "string" ? params.day : "";
  const day = days.find((d) => d.key === asked) ?? days[0];

  const totals = days.reduce(
    (t, d) => ({
      booked: t.booked + d.booked,
      held: t.held + d.held,
      blocked: t.blocked + d.blocked,
      free: t.free + d.free,
    }),
    { booked: 0, held: 0, blocked: 0, free: 0 },
  );

  return (
    <AdminShell
      name={user.name}
      viewer={viewer}
      current="/admin/meetings"
      title="Meeting calendar"
      intro={`Bilateral meetings in ${describeMeetingRooms()}, ${MEETING_SCHEDULE.slotMinutes} minutes each, UAE time. Investors choose a time when they request a meeting; it is held until the country answers. Block times that must not be offered, and cancel meetings when needed. All requests, including those without a time, are under All requests.`}
    >
      <MeetingViewsNav current="calendar" />
      {!day ? (
        <p className="rounded-xl border bg-card p-6 text-muted-foreground">
          No meeting times are set up.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          <p className="text-sm text-muted-foreground">
            All days: {totals.booked} booked · {totals.held} awaiting country ·{" "}
            {totals.blocked} blocked · {totals.free} free
          </p>

          <nav aria-label="Days" className="flex flex-wrap gap-2">
            {days.map((d) => (
              <Link
                key={d.key}
                href={`/admin/meetings?day=${d.key}`}
                aria-current={d.key === day.key ? "page" : undefined}
                className={cn(
                  "rounded-lg border px-3 py-2 text-sm font-medium",
                  d.key === day.key
                    ? "border-brand-deep bg-brand-deep text-white"
                    : "bg-card hover:bg-muted",
                )}
              >
                {d.label}
                <span className="ms-2 text-xs opacity-80">
                  {d.booked + d.held}{" "}
                  {d.booked + d.held === 1 ? "meeting" : "meetings"}
                </span>
              </Link>
            ))}
          </nav>

          <Legend />

          <section
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
                {day.blocked} blocked · {day.free} free
              </p>
            </div>

            <BlockTimesForm
              day={day.key}
              dayLabel={day.label}
              times={[
                ...day.rows.map((r) => formatClock(r.startsAt)),
                ...(day.rows.length > 0
                  ? [formatClock(day.rows[day.rows.length - 1].endsAt)]
                  : []),
              ]}
              rooms={day.rooms.map((r) => ({ id: r.id, name: r.name }))}
            />

            <div className={tableFrameClass}>
              <table className="w-full min-w-[52rem] text-sm">
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
                        {room.capacity > 0 ? (
                          <span className="ms-1 font-normal text-muted-foreground">
                            ({room.capacity} people)
                          </span>
                        ) : null}
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
                        className="px-4 py-2 text-left align-top font-medium whitespace-nowrap text-water-800"
                      >
                        {row.label}
                      </th>
                      {row.cells.map((slot, j) => (
                        <td key={j} className="px-4 py-2 align-top">
                          {slot ? (
                            <SlotCell
                              slot={slot}
                              when={`${day.label}, ${row.label}`}
                            />
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </AdminShell>
  );
}

const CHIP = {
  free: "border border-water-200 bg-white text-water-800",
  blocked: "bg-muted text-foreground",
  held: "bg-sand-100 text-sand-700",
  booked: "bg-water-100 text-water-800",
} as const;

function Chip({
  kind,
  children,
}: {
  kind: keyof typeof CHIP;
  children: string;
}) {
  return (
    <span
      className={cn(
        "w-fit rounded-full px-2 py-0.5 text-xs font-semibold",
        CHIP[kind],
      )}
    >
      {children}
    </span>
  );
}

function Legend() {
  return (
    <ul
      aria-label="Legend"
      className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
    >
      <li className="flex items-center gap-1.5">
        <Chip kind="free">Free</Chip> open to investors
      </li>
      <li className="flex items-center gap-1.5">
        <Chip kind="held">Awaiting country</Chip> held for a request
      </li>
      <li className="flex items-center gap-1.5">
        <Chip kind="booked">Booked</Chip> accepted by the country
      </li>
      <li className="flex items-center gap-1.5">
        <Chip kind="blocked">Blocked</Chip> not offered to investors
      </li>
    </ul>
  );
}

function SlotCell({ slot, when }: { slot: ScheduleSlot; when: string }) {
  const request = slot.meetingRequest;
  const where = `${when}, ${slot.room.name}`;
  if (!request) {
    const blocked = slot.status === SlotStatus.BLOCKED;
    return (
      <div className="flex flex-col gap-1">
        <Chip kind={blocked ? "blocked" : "free"}>
          {blocked ? "Blocked" : "Free"}
        </Chip>
        {blocked && slot.blockedReason ? (
          <span className="text-muted-foreground">{slot.blockedReason}</span>
        ) : null}
        <SlotActions
          slotId={slot.id}
          requestId={null}
          blocked={blocked}
          meetingLabel={where}
        />
      </div>
    );
  }
  const booked = request.status === MeetingRequestStatus.ACCEPTED;
  const attendee = request.contactName || request.requester.name;
  const email = request.contactEmail || request.requester.email;
  return (
    <div className="flex flex-col gap-1">
      <Chip kind={booked ? "booked" : "held"}>
        {booked ? "Booked" : "Awaiting country"}
      </Chip>
      <span className="font-medium">
        {request.project.country.name}: {request.project.title}
      </span>
      <span>
        {attendee}, {request.role}, {request.organisation}
      </span>
      <a href={`mailto:${email}`} className="w-fit link break-all">
        {email}
      </a>
      <details className="text-muted-foreground">
        <summary className="cursor-pointer text-xs">More details</summary>
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs">
          <dt>Account</dt>
          <dd className="break-all">
            {request.requester.name} ({request.requester.email})
          </dd>
          <dt>Requested</dt>
          <dd>{formatUaeTime(request.createdAt)}</dd>
          {request.decidedAt ? (
            <>
              <dt>Accepted</dt>
              <dd>{formatUaeTime(request.decidedAt)}</dd>
            </>
          ) : null}
          {request.note ? (
            <>
              <dt>Note</dt>
              <dd className="whitespace-pre-line">{request.note}</dd>
            </>
          ) : null}
        </dl>
      </details>
      <SlotActions
        slotId={slot.id}
        requestId={request.id}
        blocked={false}
        meetingLabel={`${request.project.country.name}: ${request.project.title}, with ${attendee} (${request.organisation}), ${where}`}
      />
    </div>
  );
}
