import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PortalHeader } from "@/components/portal/portal-header";
import { WithdrawRequestForm } from "@/components/requests/request-forms";
import { RequestStatusBadge } from "@/components/requests/request-status-badge";
import { requestMetaFrom } from "@/lib/audit";
import {
  canListSubmissions,
  canListOwnMeetingRequests,
  canUseWorkspace,
  canWithdrawMeetingRequest,
  requirePortalUser,
} from "@/lib/authz";
import { listMyRequests } from "@/lib/requests/service";
import { formatUaeTime } from "@/lib/submission/format";

// Reads the session and the database on the server before rendering, so it may block.
export const instant = false;

export const metadata: Metadata = { title: "My meeting requests" };

/** Investor: every own meeting request with its status, newest first, and a withdraw button while open (M5, F5). */
export default async function MyRequestsPage() {
  const { user, viewer } = await requirePortalUser();
  if (!canListOwnMeetingRequests(viewer)) notFound();
  const requests = await listMyRequests(viewer, {
    meta: requestMetaFrom(await headers()),
  });

  return (
    <>
      <PortalHeader
        name={user.name}
        showWorkspace={canUseWorkspace(viewer)}
        showAdmin={canListSubmissions(viewer)}
        viewer={viewer}
      />
      <main className="mx-auto flex w-full max-w-page flex-1 flex-col gap-6 px-4 py-10 sm:px-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-brand-navy">
            My meeting requests
          </h1>
          <p className="mt-1 max-w-3xl text-muted-foreground">
            Each country&rsquo;s focal point decides whom to meet. You can
            withdraw a request at any time before the Summit.
          </p>
        </div>

        {requests.length === 0 ? (
          <p className="rounded-xl border bg-card p-6 text-muted-foreground">
            You have not requested any meetings yet. Open a project in the
            pipeline and choose &ldquo;Request a meeting&rdquo;.
          </p>
        ) : (
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
                  {r.role}, {r.organisation}
                </p>
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
