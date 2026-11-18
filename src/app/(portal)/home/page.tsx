import type { Metadata } from "next";
import Link from "next/link";
import { PortalHeader } from "@/components/portal/portal-header";
import { SubmissionSummary } from "@/components/submission/submission-summary";
import { Button } from "@/components/ui/button";
import {
  canListSubmissions,
  canUseWorkspace,
  requirePortalUser,
} from "@/lib/authz";
import { getSubmissionCounts } from "@/lib/submission/service";

// Reads the session or the database and redirects on the server before rendering, so it may block.
export const instant = false;

export const metadata: Metadata = { title: "Home" };

const ROLE_LABEL = {
  PLATFORM_ADMIN: "Platform administrator",
  SUMMIT_ADMIN: "Summit team",
  COUNTRY: "Country representative",
  INVESTOR: "Investor or operator",
} as const;

/** Signed-in landing page. The pipeline (M6) is still to come; the country workspace (M5) is linked. */
export default async function HomePage() {
  const { user, viewer } = await requirePortalUser();
  const workspace = canUseWorkspace(viewer);
  const admin = canListSubmissions(viewer);
  // No email for now (user decision, 18 Nov): admins see new submissions here and on /admin/submissions.
  const counts = admin ? await getSubmissionCounts(viewer) : null;
  return (
    <>
      <PortalHeader
        name={user.name}
        showWorkspace={workspace}
        showAdmin={admin}
      />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-10 sm:px-8">
        {!user.mfaEnabled ? (
          <p
            role="status"
            className="rounded-lg border border-ack-border bg-ack-surface px-4 py-3 text-sm"
          >
            Demo setting: two-step verification is switched off on this server.
            It is required on the live portal.
          </p>
        ) : null}
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
            </div>
          </section>
        ) : null}
        {workspace ? (
          <section className="rounded-xl border bg-card p-6">
            <h2 className="text-lg font-semibold">My projects</h2>
            <p className="mt-2 text-muted-foreground">
              Add projects, upload their teasers and publish them to the
              pipeline.
            </p>
            <Button asChild size="lg" className="mt-4">
              <Link href="/workspace">Go to my projects</Link>
            </Button>
          </section>
        ) : null}
        <section className="rounded-xl border bg-card p-6">
          <h2 className="text-lg font-semibold">You are signed in</h2>
          <p className="mt-2 text-muted-foreground">
            The project pipeline will appear here.
          </p>
        </section>
      </main>
    </>
  );
}
