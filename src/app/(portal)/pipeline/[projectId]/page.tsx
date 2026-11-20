import { Download } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Chip } from "@/components/pipeline/project-card";
import {
  TeaserViewer,
  teaserFileHref,
} from "@/components/pipeline/teaser-viewer";
import { PortalHeader } from "@/components/portal/portal-header";
import { MeetingRequestPanel } from "@/components/requests/meeting-request-panel";
import { Button } from "@/components/ui/button";
import { requestMetaFrom } from "@/lib/audit";
import {
  canListSubmissions,
  canUseWorkspace,
  requirePortalUser,
} from "@/lib/authz";
import { formatUsdRange, pipelineHref } from "@/lib/pipeline/filters";
import { getPipelineProject } from "@/lib/pipeline/service";
import { PROJECT_TYPE_LABEL } from "@/lib/workspace/project-input";
import { formatBytes } from "@/lib/workspace/teaser-file";

// Reads the session and the database on the server before rendering, so it may block.
export const instant = false;

export const metadata: Metadata = { title: "Project teaser" };

const date = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Dubai",
});

/** A published project with its teaser (PLAN v0.3 F4, mockup 03 without tiers). */
export default async function PipelineProjectPage({
  params,
}: PageProps<"/pipeline/[projectId]">) {
  const { projectId } = await params;
  const { user, viewer } = await requirePortalUser();
  const data = await getPipelineProject(viewer, projectId, {
    meta: requestMetaFrom(await headers()),
  });
  if (!data) notFound();
  const { project, teaser } = data;
  const size = formatUsdRange(project.sizeMinUsd, project.sizeMaxUsd);
  const facts: [string, string | null][] = [
    ["Country", project.country.name],
    ["Sector", project.sector],
    ["PPP model", project.pppModel],
    ["Indicative size", size],
    ["Development stage", project.developmentStage],
    ["Project type", PROJECT_TYPE_LABEL[project.projectType]],
    [
      "Published",
      project.publishedAt ? date.format(project.publishedAt) : null,
    ],
  ];

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
          <nav
            aria-label="Breadcrumb"
            className="text-sm text-muted-foreground"
          >
            <ol className="flex flex-wrap items-center gap-1">
              <li>
                <Link
                  href="/pipeline"
                  className="text-brand-teal hover:underline"
                >
                  Pipeline
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li>
                <Link
                  href={pipelineHref({ country: project.country.iso3 })}
                  className="text-brand-teal hover:underline"
                >
                  {project.country.name}
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li aria-current="page" className="min-w-0 truncate">
                {project.title}
              </li>
            </ol>
          </nav>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-brand-navy">
            {project.title}
          </h1>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Chip tone="country">{project.country.name}</Chip>
            <Chip>{project.sector}</Chip>
            {project.pppModel ? <Chip>{project.pppModel}</Chip> : null}
            {teaser ? (
              <Chip>
                Teaser updated {date.format(teaser.uploadedAt)}, version{" "}
                {teaser.version}
              </Chip>
            ) : null}
          </div>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <section
            aria-labelledby="teaser-heading"
            className="rounded-xl border bg-card p-4 sm:p-6"
          >
            <h2 id="teaser-heading" className="sr-only">
              Teaser
            </h2>
            <TeaserViewer teaser={teaser} title={project.title} />
          </section>

          <div className="flex flex-col gap-6">
            <section
              aria-labelledby="glance-heading"
              className="rounded-xl border bg-card p-6"
            >
              <h2 id="glance-heading" className="text-lg font-semibold">
                Project at a glance
              </h2>
              <dl className="mt-4 divide-y">
                {facts.map(([label, value]) => (
                  <div
                    key={label}
                    className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 py-2.5 text-sm"
                  >
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="font-medium">
                      {value ?? (
                        <span className="font-normal text-muted-foreground">
                          Not stated
                        </span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            <MeetingRequestPanel viewer={viewer} projectId={project.id} />

            <section
              aria-labelledby="download-heading"
              className="rounded-xl border bg-card p-6"
            >
              <h2 id="download-heading" className="text-lg font-semibold">
                Teaser file
              </h2>
              {teaser?.canDownload ? (
                <>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {teaser.filename} ({formatBytes(teaser.sizeBytes)})
                  </p>
                  <Button asChild size="lg" className="mt-4">
                    <a href={teaserFileHref(teaser.id, "download")} download>
                      <Download aria-hidden="true" />
                      Download teaser
                    </a>
                  </Button>
                </>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  {teaser?.canOpen
                    ? "The country has switched off downloads for this teaser. You can read it on this page."
                    : "The teaser can be downloaded once it is available."}
                </p>
              )}
              <p className="mt-4 text-xs text-muted-foreground">
                Access is personal and logged.
              </p>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
