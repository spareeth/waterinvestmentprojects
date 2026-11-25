import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import {
  BlocksImportForm,
  CounterpartsForm,
} from "@/components/admin/meeting-blocks-forms";
import { MeetingViewsNav } from "@/components/admin/meeting-views-nav";
import { Tag } from "@/components/workspace/status-badge";
import { canManageMeetingBlocks, requirePortalUser } from "@/lib/authz";
import {
  BLOCK_ROOMS,
  blockSlotStarts,
  formatClock,
  formatMeetingDay,
  MEETING_SIGNUP,
} from "@/lib/meetings/schedule";
import { listCountryMeetingSetup } from "@/lib/meetings/signups";

// Reads the session and the database on the server before rendering, so it may block.
export const instant = false;

export const metadata: Metadata = { title: "Time blocks and counterparts" };

/**
 * Admin (25 Nov): each country's time blocks (from WBG's time-block sheet), which give the times investors can
 * tick when they sign up, and the government counterparts shown on the country's project pages.
 */
export default async function MeetingBlocksPage() {
  const { user, viewer } = await requirePortalUser();
  if (!canManageMeetingBlocks(viewer)) notFound();
  const countries = await listCountryMeetingSetup(viewer);

  return (
    <AdminShell
      name={user.name}
      viewer={viewer}
      current="/inbox"
      title="Meeting calendar"
      intro={`Each country's time blocks decide which times investors can tick when they sign up (${MEETING_SIGNUP.meetingMinutes}-minute meetings every ${MEETING_SIGNUP.slotMinutes} minutes, UAE time). Rooms are never shown to investors.`}
    >
      <MeetingViewsNav current="blocks" />
      <BlocksImportForm rooms={BLOCK_ROOMS} />
      <ul className="flex flex-col gap-4">
        {countries.map((c) => {
          const slots = blockSlotStarts(c.meetingBlocks).length;
          return (
            <li
              key={c.id}
              className="flex flex-col gap-3 rounded-xl border bg-card p-5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold text-brand-navy">
                  {c.name}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    {c.iso3}
                  </span>
                </h2>
                <div className="flex flex-wrap gap-2">
                  {c.status === "INACTIVE" ? <Tag>Switched off</Tag> : null}
                  <Tag>
                    {slots} {slots === 1 ? "time" : "times"}
                  </Tag>
                  <Tag>
                    {c._count.meetingSignups}{" "}
                    {c._count.meetingSignups === 1 ? "sign-up" : "sign-ups"}
                  </Tag>
                </div>
              </div>
              {c.meetingBlocks.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No time blocks yet: investors cannot sign up for this country.
                </p>
              ) : (
                <ul className="flex flex-col gap-1 text-sm">
                  {c.meetingBlocks.map((b) => (
                    <li key={b.id}>
                      {formatMeetingDay(b.startsAt)}, {formatClock(b.startsAt)}{" "}
                      to {formatClock(b.endsAt)} ·{" "}
                      <span className="text-muted-foreground">
                        {b.room.name}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <CounterpartsForm
                countryId={c.id}
                countryName={c.name}
                initial={c.meetingCounterparts}
              />
            </li>
          );
        })}
      </ul>
    </AdminShell>
  );
}
