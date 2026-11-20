import type { Metadata } from "next";
import Link from "next/link";
import { PipelineFilterBar } from "@/components/pipeline/pipeline-filters";
import { ProjectCard } from "@/components/pipeline/project-card";
import { PortalHeader } from "@/components/portal/portal-header";
import { Button } from "@/components/ui/button";
import {
  canListSubmissions,
  canUseWorkspace,
  requirePortalUser,
} from "@/lib/authz";
import { hasActiveFilters, parsePipelineFilters } from "@/lib/pipeline/filters";
import { listPipelineProjects, pipelineFacets } from "@/lib/pipeline/service";

// Reads the session and the database on the server before rendering, so it may block.
export const instant = false;

export const metadata: Metadata = { title: "Project pipeline" };

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/** All published teasers the viewer may see, with filters in the URL (PLAN v0.3 F3, mockup 02 without tiers). */
export default async function PipelinePage({
  searchParams,
}: PageProps<"/pipeline">) {
  const { user, viewer } = await requirePortalUser();
  const filters = parsePipelineFilters(await searchParams);
  const [projects, facets] = await Promise.all([
    listPipelineProjects(viewer, filters),
    pipelineFacets(viewer),
  ]);
  const filtered = hasActiveFilters(filters);

  return (
    <>
      <PortalHeader
        name={user.name}
        viewer={viewer}
        showWorkspace={canUseWorkspace(viewer)}
        showAdmin={canListSubmissions(viewer)}
      />
      <main className="mx-auto flex w-full max-w-page flex-1 flex-col gap-6 px-4 py-8 sm:px-8 sm:py-10">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-brand-navy">
            Project pipeline
          </h1>
          <p className="mt-2 text-muted-foreground">
            {facets.total > 0
              ? `${plural(facets.total, "project teaser", "project teasers")} from ${plural(facets.countryCount, "country", "countries")}. Open a teaser to read it in full or download it.`
              : "Project teasers appear here once Governments have published them."}
          </p>
        </div>

        {facets.total > 0 ? (
          <>
            <PipelineFilterBar filters={filters} options={facets} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p
                role="status"
                aria-live="polite"
                className="text-sm text-muted-foreground"
              >
                {filtered
                  ? `${plural(projects.length, "project matches", "projects match")} your filters.`
                  : `Showing all ${plural(projects.length, "project", "projects")}.`}
              </p>
              {filtered ? (
                <Link
                  href="/pipeline"
                  className="text-sm font-medium text-brand-teal hover:underline"
                >
                  Clear filters
                </Link>
              ) : null}
            </div>
          </>
        ) : null}

        {projects.length > 0 ? (
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <li key={project.id} className="flex">
                <ProjectCard project={project} />
              </li>
            ))}
          </ul>
        ) : facets.total > 0 ? (
          <section className="flex flex-col items-start gap-3 rounded-xl border border-dashed bg-card p-8">
            <h2 className="text-lg font-semibold">
              No projects match these filters
            </h2>
            <p className="text-muted-foreground">
              Try another country, sector or size, or clear the filters to see
              every project.
            </p>
            <Button asChild variant="outline">
              <Link href="/pipeline">Clear filters</Link>
            </Button>
          </section>
        ) : (
          <section className="flex flex-col items-start gap-3 rounded-xl border border-dashed bg-card p-8">
            <h2 className="text-lg font-semibold">No projects published yet</h2>
            <p className="text-muted-foreground">
              Please check back soon. New teasers are added as Governments
              publish them ahead of the Summit.
            </p>
          </section>
        )}
      </main>
    </>
  );
}
