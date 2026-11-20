import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PortalHeader } from "@/components/portal/portal-header";
import {
  ScanBadge,
  StatusBadge,
  Tag,
} from "@/components/workspace/status-badge";
import { requestMetaFrom } from "@/lib/audit";
import {
  canListSubmissions,
  canUseWorkspace,
  requirePortalUser,
} from "@/lib/authz";
import { formatUaeTime } from "@/lib/submission/format";
import {
  getSubmissionCounts,
  isRecentSubmission,
  listSubmissions,
  type SubmissionListItem,
} from "@/lib/submission/service";
import { SubmissionSummary } from "@/components/submission/submission-summary";
import { formatBytes } from "@/lib/workspace/teaser-file";

// Reads the session and the database on the server before rendering, so it may block.
export const instant = false;

export const metadata: Metadata = { title: "Teaser submissions" };

type SubmissionDocument = SubmissionListItem["documents"][number];

/** A submission's teaser files grouped by project, in the order they came. */
function byProject(documents: SubmissionDocument[]) {
  const groups = new Map<
    string,
    {
      project: SubmissionDocument["project"];
      documents: SubmissionDocument[];
    }
  >();
  for (const d of documents) {
    const group = groups.get(d.project.id);
    if (group) group.documents.push(d);
    else groups.set(d.project.id, { project: d.project, documents: [d] });
  }
  return [...groups.values()];
}

/**
 * Admin: every teaser submission (upload links and, since M1, portal workspace uploads), newest first, with
 * downloads through /files/<id>
 * (the policy module decides and audits each download). M0, PLAN v0.3 F0. With no email for now (user decision,
 * 18 Nov) this page is also the notification: counts at the top, recent submissions marked "New".
 */
export default async function SubmissionsPage() {
  const { user, viewer } = await requirePortalUser();
  if (!canListSubmissions(viewer)) notFound();
  const now = new Date();
  const [submissions, counts] = await Promise.all([
    listSubmissions(viewer, { meta: requestMetaFrom(await headers()) }),
    getSubmissionCounts(viewer, { now }),
  ]);

  return (
    <>
      <PortalHeader
        name={user.name}
        viewer={viewer}
        showWorkspace={canUseWorkspace(viewer)}
        showAdmin
      />
      <main className="mx-auto flex w-full max-w-page flex-1 flex-col gap-6 px-4 py-10 sm:px-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-brand-navy">
            Teaser submissions
          </h1>
          <p className="mt-1 max-w-3xl text-muted-foreground">
            Newest first. Each teaser sent through an upload link is saved as a
            draft project. Files marked &ldquo;Virus check pending&rdquo; have
            not been scanned yet: open them with care.
          </p>
        </div>
        <SubmissionSummary counts={counts} />

        {submissions.length === 0 ? (
          <p className="rounded-xl border bg-card p-6 text-muted-foreground">
            No submissions yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {submissions.map((s) => (
              <li key={s.id} className="rounded-xl border bg-card p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="flex items-center gap-2 text-lg font-semibold text-brand-navy">
                    {s.country.name}
                    {isRecentSubmission(s.createdAt, now) ? (
                      <span className="rounded-full bg-success px-2.5 py-0.5 text-xs font-semibold text-success-foreground">
                        New
                      </span>
                    ) : null}
                  </h2>
                  <span className="text-sm text-muted-foreground">
                    {formatUaeTime(s.createdAt)}
                  </span>
                </div>
                <p className="mt-1 text-sm">
                  {s.uploaderName}{" "}
                  <a
                    href={`mailto:${s.uploaderEmail}`}
                    className="text-brand-teal hover:underline"
                  >
                    {s.uploaderEmail}
                  </a>
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Tag>
                    {s.uploadLink === null
                      ? "Portal upload"
                      : s.uploadLink.countryId === null
                        ? "Generic link"
                        : "Country link"}
                  </Tag>
                  Consent given {formatUaeTime(s.ackAcceptedAt)}, wording{" "}
                  {s.ackTextVersion}. Reference{" "}
                  <span className="font-mono">{s.id}</span>.
                </p>
                <ul className="mt-4 flex flex-col divide-y rounded-lg border">
                  {byProject(s.documents).map(({ project: p, documents }) => (
                    <li key={p.id} className="flex flex-col gap-2 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{p.title}</span>
                        <StatusBadge status={p.status} />
                        <span className="text-sm text-muted-foreground">
                          {p.sector}
                        </span>
                      </div>
                      {documents.map((d) => (
                        <div
                          key={d.id}
                          className="flex flex-wrap items-center gap-2 text-sm"
                        >
                          <span>
                            {d.filename}
                            {d.version > 1 ? ` (version ${d.version})` : ""}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatBytes(d.sizeBytes)} · SHA-256{" "}
                            <span className="font-mono">
                              {d.sha256.slice(0, 12)}
                            </span>
                          </span>
                          <ScanBadge status={d.scanStatus} />
                          {d.scanStatus === "CLEAN" ||
                          d.scanStatus === "PENDING" ? (
                            <a
                              href={`/files/${d.id}?download=1`}
                              className="text-sm font-medium text-brand-teal hover:underline"
                            >
                              Download
                            </a>
                          ) : null}
                        </div>
                      ))}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
