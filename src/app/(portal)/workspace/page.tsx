import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PortalHeader } from "@/components/portal/portal-header";
import { Button } from "@/components/ui/button";
import {
  ScanBadge,
  StatusBadge,
  Tag,
} from "@/components/workspace/status-badge";
import {
  canCreateProject,
  canUseWorkspace,
  isAdminViewer,
  requirePortalUser,
} from "@/lib/authz";
import {
  listWorkspaceCountries,
  listWorkspaceProjects,
} from "@/lib/workspace/service";

// Reads the session and the database on the server before rendering, so it may block.
export const instant = false;

export const metadata: Metadata = { title: "My projects" };

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Dubai",
});

/** "My projects" (PLAN F3): the country's projects, or every country's for the Summit team. */
export default async function WorkspacePage() {
  const { user, viewer } = await requirePortalUser();
  if (!canUseWorkspace(viewer)) notFound();
  const [projects, countries] = await Promise.all([
    listWorkspaceProjects(viewer),
    listWorkspaceCountries(viewer),
  ]);
  const admin = isAdminViewer(viewer);
  const canAdd = canCreateProject(viewer) && countries.length > 0;
  const intro = admin
    ? "All country workspaces. You can add and update projects for a country, upload a teaser once its government has consented in writing, and publish on its behalf."
    : `${countries.map((c) => c.name).join(", ")} projects. Only your country team and the Summit administrators can see this page. The Summit team publishes teasers and updates project details.`;

  return (
    <>
      <PortalHeader name={user.name} showWorkspace />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-10 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-brand-navy">
              My projects
            </h1>
            <p className="mt-1 max-w-3xl text-muted-foreground">{intro}</p>
          </div>
          {canAdd ? (
            <Button asChild size="lg">
              <Link href="/workspace/projects/new">Add a project</Link>
            </Button>
          ) : null}
        </div>

        {projects.length === 0 ? (
          <section className="rounded-xl border bg-card p-6">
            <h2 className="text-lg font-semibold">No projects yet</h2>
            <p className="mt-2 text-muted-foreground">
              {canAdd
                ? "Add a project, upload its one-page teaser and publish it to the pipeline when it is ready."
                : "Teasers your government submits through its upload link appear here."}
            </p>
          </section>
        ) : (
          <ul className="flex flex-col gap-3">
            {projects.map((p) => {
              const teaser = p.documents[0];
              return (
                <li key={p.id}>
                  <Link
                    href={`/workspace/projects/${p.id}`}
                    className="flex flex-col gap-3 rounded-xl border bg-card p-5 transition-colors hover:border-brand-teal focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex flex-col gap-1">
                      <span className="text-lg font-semibold text-brand-navy">
                        {p.title}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {admin ? `${p.country.name} · ` : ""}
                        {p.sector}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={p.status} />
                      {teaser ? (
                        <>
                          <Tag>Teaser v{teaser.version}</Tag>
                          {teaser.scanStatus !== "CLEAN" ? (
                            <ScanBadge status={teaser.scanStatus} />
                          ) : null}
                          <Tag>
                            {teaser.allowDownload
                              ? "Download allowed"
                              : "View only"}
                          </Tag>
                        </>
                      ) : (
                        <Tag>No teaser yet</Tag>
                      )}
                      <span className="text-xs text-muted-foreground">
                        Updated {dateFormat.format(p.updatedAt)}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
