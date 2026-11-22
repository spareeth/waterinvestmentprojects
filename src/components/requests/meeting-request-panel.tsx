import Link from "next/link";
import type { Viewer } from "@/lib/authz";
import { getRequestPanel } from "@/lib/requests/service";
import { formatMeetingSlot } from "@/lib/meetings/schedule";
import { formatUaeTime } from "@/lib/submission/format";
import { MeetingRequestForm, WithdrawRequestForm } from "./request-forms";
import { RoomCalendar } from "./room-calendar";
import { RequestStatusBadge } from "./request-status-badge";

/**
 * "Request a meeting" on a project page (M5, PLAN v0.3 F5), for the pipeline project page (M4) to render below the
 * teaser. Renders nothing unless the policy module lets the viewer request a meeting on this project (an investor,
 * a PUBLISHED project). Shows the form, or the viewer's open request with its status and a withdraw button.
 */
export async function MeetingRequestPanel({
  viewer,
  projectId,
}: {
  viewer: Viewer;
  projectId: string;
}) {
  const panel = await getRequestPanel(viewer, projectId);
  if (!panel) return null;
  return (
    <section
      aria-labelledby="meeting-request-heading"
      className="flex flex-col gap-4 rounded-xl border bg-card p-6"
    >
      <div>
        <h2 id="meeting-request-heading" className="text-lg font-semibold">
          Interested in this project?
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Request a bilateral meeting at the Water Investment Summit and choose
          a time. Your request goes to the country, which reviews it and
          replies.
        </p>
      </div>
      {panel.open ? (
        <div className="flex flex-col gap-3">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <RequestStatusBadge status={panel.open.status} />
            You requested a meeting on {formatUaeTime(panel.open.createdAt)}.
          </p>
          {panel.open.slot ? (
            <p className="text-sm">
              <span className="font-semibold">Meeting time:</span>{" "}
              {formatMeetingSlot(panel.open.slot)}
              {panel.open.status === "PENDING"
                ? ", held until the country answers"
                : ""}
            </p>
          ) : null}
          <RoomCalendar rooms={panel.rooms} readOnly />
          <WithdrawRequestForm requestId={panel.open.id} />
          <p className="text-sm">
            <Link href="/requests" className="link">
              See all my meeting requests
            </Link>
          </p>
        </div>
      ) : (
        <MeetingRequestForm
          projectId={projectId}
          defaults={panel.defaults}
          times={panel.times}
          rooms={panel.rooms}
        />
      )}
    </section>
  );
}
