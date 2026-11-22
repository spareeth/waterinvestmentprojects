import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PortalHeader } from "@/components/portal/portal-header";
import { SubmissionSummary } from "@/components/submission/submission-summary";
import { Button } from "@/components/ui/button";
import {
  canListSubmissions,
  canUseWorkspace,
  canViewRequestInbox,
  requirePortalUser,
} from "@/lib/authz";
import { ROLE_LABEL } from "@/lib/auth/role-labels";
import { getRequestCounts } from "@/lib/requests/service";
import { getSubmissionCounts } from "@/lib/submission/service";

// Reads the session or the database and redirects on the server before rendering, so it may block.
export const instant = false;

export const metadata: Metadata = { title: "Home" };

/** Signed-in landing page. The pipeline (M6) is still to come; the country workspace (M5) is linked. */
export default async function HomePage() {
  const { user, viewer } = await requirePortalUser();
  // M4: investors land on the pipeline (navigation only; the pipeline page asks the policy module itself).
  if (user.role === "INVESTOR") redirect("/pipeline");
  const workspace = canUseWorkspace(viewer);
  const admin = canListSubmissions(viewer);
  // No email for now (user decision, 18 Nov): admins see new submissions here and on /admin/submissions.
  const counts = admin ? await getSubmissionCounts(viewer) : null;
  // M5: the request inbox counts are the notification that does not depend on email (PLAN 0a.5).
  const requestCounts = canViewRequestInbox(viewer)
    ? await getRequestCounts(viewer)
    : null;
  return (
    <>
      <PortalHeader
        name={user.name}
        viewer={viewer}
        showWorkspace={workspace}
        showAdmin={admin}
      />
      <main className="mx-auto flex w-full max-w-page flex-1 flex-col gap-6 px-4 py-10 sm:px-8">
        <div>
          <p className="text-sm font-bold text-brand-teal uppercase">
            {ROLE_LABEL[user.role]}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-brand-navy">
            Welcome, {user.name}
          </h1>
          {user.organisation ? (
            <p className="mt-1 text-muted-foreground">{user.organisation}</p>
          ) : null}
        </div>
        {counts ? (
          <section className="flex flex-col gap-4 rounded-xl border bg-card p-6">
            <div>
              <h2 className="text-lg font-semibold">Teaser uploads</h2>
              <p className="mt-2 text-muted-foreground">
                Create upload links for Governments and collect their teasers.
              </p>
            </div>
            <SubmissionSummary counts={counts} />
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/admin/submissions">See submissions</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/admin/upload-links">Manage upload links</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/admin/accounts">Manage accounts</Link>
              </Button>
            </div>
          </section>
        ) : null}
        {requestCounts ? (
          <section className="flex flex-col gap-4 rounded-xl border bg-card p-6">
            <div>
              <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                Meeting requests
                {requestCounts.newPending > 0 ? (
                  <span className="rounded-full bg-success px-2.5 py-0.5 text-xs font-semibold text-success-foreground">
                    {requestCounts.newPending} new
                  </span>
                ) : null}
              </h2>
              <p className="mt-2 text-muted-foreground">
                {requestCounts.pending === 1
                  ? "1 request is awaiting a reply"
                  : `${requestCounts.pending} requests are awaiting a reply`}
                , out of {requestCounts.total} in total.
              </p>
            </div>
            <div>
              <Button asChild size="lg">
                <Link href="/inbox">See meeting requests</Link>
              </Button>
            </div>
          </section>
        ) : null}
        {workspace ? (
          <section className="rounded-xl border bg-card p-6">
            <h2 className="text-lg font-semibold">My projects</h2>
            <p className="mt-2 text-muted-foreground">
              {admin
                ? "Add projects, upload their teasers and publish them to the pipeline."
                : "Your country's projects in any status, as the Summit team prepares and publishes them."}
            </p>
            <Button asChild size="lg" className="mt-4">
              <Link href="/workspace">Go to my projects</Link>
            </Button>
          </section>
        ) : null}
        <section className="rounded-xl border bg-card p-6">
          <h2 className="text-lg font-semibold">Pipeline projects</h2>
          <p className="mt-2 text-muted-foreground">
            See the published project teasers of every participating country and
            download them.
          </p>
          <Button asChild size="lg" className="mt-4">
            <Link href="/pipeline">Go to the pipeline</Link>
          </Button>
        </section>
      </main>
    </>
  );
}
