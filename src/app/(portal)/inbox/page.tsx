import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PortalHeader } from "@/components/portal/portal-header";
import { DecisionForm } from "@/components/requests/request-forms";
import {
  NewMarker,
  RequestStatusBadge,
} from "@/components/requests/request-status-badge";
import { Button } from "@/components/ui/button";
import { MeetingRequestStatus } from "@/generated/prisma/enums";
import { requestMetaFrom } from "@/lib/audit";
import {
  canExportMeetingRequests,
  canViewRequestInbox,
  isAdminViewer,
  requirePortalUser,
} from "@/lib/authz";
import { formatMeetingSlot } from "@/lib/meetings/schedule";
import {
  getRequestCounts,
  type InboxFilter,
  isNewRequest,
  listInboxCountries,
  listInboxRequests,
  requestContact,
} from "@/lib/requests/service";
import { formatUaeTime } from "@/lib/submission/format";

// Reads the session and the database on the server before rendering, so it may block.
export const instant = false;

export const metadata: Metadata = { title: "Meeting request inbox" };

const STATUS_FILTERS: { value: MeetingRequestStatus | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: MeetingRequestStatus.PENDING, label: "Awaiting reply" },
  { value: MeetingRequestStatus.ACCEPTED, label: "Accepted" },
  { value: MeetingRequestStatus.DECLINED, label: "Declined" },
  { value: MeetingRequestStatus.WITHDRAWN, label: "Withdrawn" },
  { value: MeetingRequestStatus.CANCELLED, label: "Cancelled" },
];

function one(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

/** Only known statuses and the ids of countries in the viewer's inbox pass; anything else is ignored. */
function filterFrom(
  params: Record<string, string | string[] | undefined>,
  countryIds: string[],
): InboxFilter {
  const status = one(params.status);
  const country = one(params.country);
  return {
    status: Object.values(MeetingRequestStatus).includes(
      status as MeetingRequestStatus,
    )
      ? (status as MeetingRequestStatus)
      : undefined,
    countryId: countryIds.includes(country) ? country : undefined,
  };
}

function query(filter: InboxFilter): string {
  const p = new URLSearchParams();
  if (filter.countryId) p.set("country", filter.countryId);
  if (filter.status) p.set("status", filter.status);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/**
 * Request inbox (M5, PLAN v0.3 F6): requests on the projects of the viewer's countries. Focal points (and admins
 * for any country) accept or decline; WBG coordinators read only. Counts and "New" markers stand in for email
 * (PLAN 0a.5). CSV download of the same rows through /inbox/export.
 */
export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user, viewer } = await requirePortalUser();
  if (!canViewRequestInbox(viewer)) notFound();
  const now = new Date();
  const countries = await listInboxCountries(viewer);
  const filter = filterFrom(
    await searchParams,
    countries.map((c) => c.id),
  );
  const [requests, counts] = await Promise.all([
    listInboxRequests(viewer, filter, {
      meta: requestMetaFrom(await headers()),
    }),
    getRequestCounts(viewer, { now }),
  ]);
  const admin = isAdminViewer(viewer);
  const readOnly = !requests.some((r) => r.canDecide) && !admin;

  return (
    <>
      <PortalHeader name={user.name} viewer={viewer} />
      <main className="mx-auto flex w-full max-w-page flex-1 flex-col gap-6 px-4 py-10 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-brand-navy">
              Meeting requests
            </h1>
            <p className="mt-1 max-w-3xl text-muted-foreground">
              {admin
                ? "Requests from investors and operators for every country. Accept or decline on behalf of a country when its focal point asks you to."
                : "Requests from investors and operators to meet about your country's projects. Choose whom to meet: accept or decline each request."}
            </p>
          </div>
          {canExportMeetingRequests(viewer) ? (
            <Button asChild variant="outline" size="lg">
              <a href={`/inbox/export${query(filter)}`} download>
                Download CSV
              </a>
            </Button>
          ) : null}
        </div>

        <dl className="grid grid-cols-3 gap-3 sm:max-w-xl">
          {[
            { label: "Awaiting reply", value: counts.pending },
            { label: "New today", value: counts.newPending },
            { label: "All requests", value: counts.total },
          ].map((c) => (
            <div key={c.label} className="rounded-xl border bg-card p-4">
              <dt className="text-xs text-muted-foreground">{c.label}</dt>
              <dd className="text-2xl font-semibold text-brand-navy">
                {c.value}
              </dd>
            </div>
          ))}
        </dl>

        <nav
          aria-label="Filter requests"
          className="flex flex-col gap-3 rounded-xl border bg-card p-4"
        >
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold">Status:</span>
            {STATUS_FILTERS.map((s) => {
              const active = (filter.status ?? "") === s.value;
              return (
                <Link
                  key={s.label}
                  href={`/inbox${query({ ...filter, status: s.value || undefined })}`}
                  aria-current={active ? "page" : undefined}
                  className={
                    active
                      ? "rounded-full bg-brand-navy px-3 py-1 text-white"
                      : "rounded-full border px-3 py-1 hover:bg-muted"
                  }
                >
                  {s.label}
                </Link>
              );
            })}
          </div>
          {countries.length > 1 ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">Country:</span>
              {[{ id: "", name: "All" }, ...countries].map((c) => {
                const active = (filter.countryId ?? "") === c.id;
                return (
                  <Link
                    key={c.id || "all"}
                    href={`/inbox${query({ ...filter, countryId: c.id || undefined })}`}
                    aria-current={active ? "page" : undefined}
                    className={
                      active
                        ? "rounded-full bg-brand-navy px-3 py-1 text-white"
                        : "rounded-full border px-3 py-1 hover:bg-muted"
                    }
                  >
                    {c.name}
                  </Link>
                );
              })}
            </div>
          ) : null}
        </nav>

        {readOnly && requests.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            You can read these requests. The country&rsquo;s focal point accepts
            or declines them.
          </p>
        ) : null}

        {requests.length === 0 ? (
          <p className="rounded-xl border bg-card p-6 text-muted-foreground">
            No requests to show.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {requests.map((r) => {
              const contact = requestContact(r);
              return (
                <li
                  key={r.id}
                  className="flex flex-col gap-3 rounded-xl border bg-card p-5"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold text-brand-navy">
                      {r.project.title}
                      {r.status === MeetingRequestStatus.PENDING &&
                      isNewRequest(r.createdAt, now) ? (
                        <NewMarker />
                      ) : null}
                    </h2>
                    <RequestStatusBadge status={r.status} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {r.project.country.name} · {r.project.sector} · requested{" "}
                    {formatUaeTime(r.createdAt)}
                  </p>
                  <div className="text-sm">
                    <p className="font-medium">
                      {contact.name}, {r.role}, {r.organisation}
                    </p>
                    <a href={`mailto:${contact.email}`} className="link">
                      {contact.email}
                    </a>
                  </div>
                  <MeetingTimeLine slot={r.slot} status={r.status} />
                  {r.note ? (
                    <p className="rounded-lg bg-muted px-3 py-2 text-sm whitespace-pre-line">
                      {r.note}
                    </p>
                  ) : null}
                  {r.decidedAt ? (
                    <p className="text-xs text-muted-foreground">
                      {r.status === MeetingRequestStatus.ACCEPTED
                        ? "Accepted"
                        : r.status === MeetingRequestStatus.DECLINED
                          ? "Declined"
                          : "Answered"}{" "}
                      {r.decidedBy ? `by ${r.decidedBy.name} ` : ""}on{" "}
                      {formatUaeTime(r.decidedAt)}
                    </p>
                  ) : null}
                  {r.canDecide ? <DecisionForm requestId={r.id} /> : null}
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}

/** The chosen time and room, or a line saying none was chosen. */
function MeetingTimeLine({
  slot,
  status,
}: {
  slot: { startsAt: Date; endsAt: Date; room: { name: string } } | null;
  status: MeetingRequestStatus;
}) {
  if (!slot) {
    return status === MeetingRequestStatus.PENDING ||
      status === MeetingRequestStatus.ACCEPTED ? (
      <p className="text-sm text-muted-foreground">
        No meeting time chosen. The Summit team will arrange one.
      </p>
    ) : null;
  }
  return (
    <p className="rounded-lg bg-water-50 px-3 py-2 text-sm">
      <span className="font-semibold text-brand-navy">
        {status === MeetingRequestStatus.ACCEPTED
          ? "Meeting booked:"
          : "Proposed time:"}
      </span>{" "}
      {formatMeetingSlot(slot)}
    </p>
  );
}
