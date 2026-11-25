import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PortalHeader } from "@/components/portal/portal-header";
import { WithdrawRequestForm } from "@/components/requests/request-forms";
import { RequestStatusBadge } from "@/components/requests/request-status-badge";
import { requestMetaFrom } from "@/lib/audit";
import {
  canListOwnMeetingRequests,
  canWithdrawMeetingRequest,
  requirePortalUser,
} from "@/lib/authz";
import { SignupList } from "@/components/requests/signup-list";
import { formatMeetingSlot, MEETING_SIGNUP } from "@/lib/meetings/schedule";
import { listMySignups } from "@/lib/meetings/signups";
import { listMyRequests, requestContact } from "@/lib/requests/service";
import { formatUaeTime } from "@/lib/submission/format";

// Reads the session and the database on the server before rendering, so it may block.
export const instant = false;

export const metadata: Metadata = { title: "My meeting sign-ups" };

/** Investor: every own meeting request with its status, newest first, and a withdraw button while open (M5, F5). */
export default async function MyRequestsPage() {
  const { user, viewer } = await requirePortalUser();
  if (!canListOwnMeetingRequests(viewer)) notFound();
  const [requests, signups] = await Promise.all([
    listMyRequests(viewer, { meta: requestMetaFrom(await headers()) }),
    listMySignups(viewer),
  ]);

  return (
    <>
      <PortalHeader name={user.name} viewer={viewer} />
      <main className="mx-auto flex w-full max-w-page flex-1 flex-col gap-6 px-4 py-10 sm:px-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-brand-navy">
            My meeting sign-ups
          </h1>
          <p className="mt-1 max-w-3xl text-muted-foreground">
            The countries you signed up to meet and the times you can make.
            Sign-ups close on {MEETING_SIGNUP.deadlineLabel}; the Summit team
            then matches investors and delegations, and you will receive a
            meeting confirmation by email by {MEETING_SIGNUP.confirmationLabel}.
            Signing up does not guarantee a meeting.
          </p>
        </div>

        <SignupList
          rows={signups}
          mine
          empty="You have not signed up for any meetings yet. Open a project in the pipeline and tick the times you could meet its country's delegation."
        />

        {requests.length === 0 ? null : (
          <h2 className="mt-4 text-lg font-semibold text-brand-navy">
            Earlier meeting requests
          </h2>
        )}
        {requests.length === 0 ? null : (
          <ul className="flex flex-col gap-4">
            {requests.map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-3 rounded-xl border bg-card p-5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-lg font-semibold text-brand-navy">
                    {r.project.title}
                  </h2>
                  <RequestStatusBadge status={r.status} />
                </div>
                <p className="text-sm text-muted-foreground">
                  {r.project.country.name} · {r.project.sector} · requested{" "}
                  {formatUaeTime(r.createdAt)}
                  {r.decidedAt
                    ? ` · answered ${formatUaeTime(r.decidedAt)}`
                    : ""}
                </p>
                <p className="text-sm">
                  {requestContact(r).name} ({requestContact(r).email}), {r.role}
                  , {r.organisation}
                </p>
                {r.slot ? (
                  <p className="rounded-lg bg-water-50 px-3 py-2 text-sm">
                    <span className="font-semibold text-brand-navy">
                      {r.status === "ACCEPTED"
                        ? "Meeting booked:"
                        : r.status === "PENDING"
                          ? "Time held for you:"
                          : "Time chosen:"}
                    </span>{" "}
                    {formatMeetingSlot(r.slot)}
                  </p>
                ) : null}
                {r.note ? (
                  <p className="text-sm whitespace-pre-line">{r.note}</p>
                ) : null}
                {canWithdrawMeetingRequest(viewer, r) ? (
                  <WithdrawRequestForm requestId={r.id} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
