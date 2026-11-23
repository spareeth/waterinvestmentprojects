import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { ProjectTable } from "@/components/admin/project-table";
import { Button } from "@/components/ui/button";
import { Notice, Select } from "@/components/workspace/form-controls";
import { CountryStatus, ProjectStatus } from "@/generated/prisma/enums";
import { requirePortalUser } from "@/lib/authz";
import { canUseAdminConsole } from "@/lib/authz/admin";
import { listAdminCountries } from "@/lib/admin/countries";
import { listAdminProjects } from "@/lib/admin/projects";

// Reads the session and the database on the server before rendering, so it may block.
export const instant = false;

export const metadata: Metadata = { title: "Projects" };

const STATUS_LABEL: Record<ProjectStatus, string> = {
  DRAFT: "Drafts",
  PUBLISHED: "In the pipeline",
  WITHDRAWN: "Withdrawn",
};

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.slice(0, 64) ?? "";
}

/** Every project, for the admin team (M7): filters, publish, unpublish; editing stays in the workspace. */
export default async function AdminProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user, viewer } = await requirePortalUser();
  if (!canUseAdminConsole(viewer)) notFound();
  const params = await searchParams;
  const countryId = first(params.country);
  const statusRaw = first(params.status);
  const status = (Object.values(ProjectStatus) as string[]).includes(statusRaw)
    ? (statusRaw as ProjectStatus)
    : undefined;
  const missing = first(params.missing) === "1";

  const [projects, countries] = await Promise.all([
    listAdminProjects(viewer, {
      countryId: countryId || undefined,
      status,
      missing,
    }),
    listAdminCountries(viewer),
  ]);

  return (
    <AdminShell
      name={user.name}
      viewer={viewer}
      current="/admin/projects"
      title="Projects"
      intro="All projects of all countries. Fill in PPP model, size and development stage (here through Edit, or many at once by CSV import), then publish. A project can be published once its teaser has passed the virus check. To delete a project, open it with Edit."
    >
      {first(params.deleted) === "1" ? (
        <Notice tone="success">Project deleted.</Notice>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="filter-country" className="text-xs font-semibold">
              Country
            </label>
            <Select
              id="filter-country"
              name="country"
              defaultValue={countryId}
              className="w-48"
            >
              <option value="">All countries</option>
              {countries.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.status === CountryStatus.INACTIVE ? " (switched off)" : ""}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="filter-status" className="text-xs font-semibold">
              Status
            </label>
            <Select
              id="filter-status"
              name="status"
              defaultValue={status ?? ""}
              className="w-44"
            >
              <option value="">Any status</option>
              {Object.values(ProjectStatus).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </div>
          <label className="flex h-10 items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="missing"
              value="1"
              defaultChecked={missing}
              className="size-4"
            />
            Missing filters only
          </label>
          <Button type="submit" variant="outline" className="h-10">
            Show
          </Button>
        </form>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline" className="h-10">
            <Link href="/admin/projects/import">Import filters from a CSV</Link>
          </Button>
          <Button asChild variant="outline" className="h-10">
            <a href="/admin/exports/projects.csv">Download as CSV</a>
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {projects.length} project{projects.length === 1 ? "" : "s"}
      </p>
      {projects.length > 0 ? (
        <ProjectTable
          projects={projects.map((p) => ({
            id: p.id,
            title: p.title,
            sector: p.sector,
            country: p.country.name,
            countryInactive: p.country.status === CountryStatus.INACTIVE,
            pppModel: p.pppModel,
            sizeMinUsd: p.sizeMinUsd,
            sizeMaxUsd: p.sizeMaxUsd,
            developmentStage: p.developmentStage,
            status: p.status,
            teaser: p.teaser,
            needsPdf: p.needsPdf,
            missing: p.missing,
            canPublish: p.can.publish && !p.needsPdf,
            canWithdraw: p.can.withdraw,
          }))}
        />
      ) : (
        <p className="rounded-xl border bg-card p-6 text-muted-foreground">
          No project matches these filters.
        </p>
      )}
    </AdminShell>
  );
}
