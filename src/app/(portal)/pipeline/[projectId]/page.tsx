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
import { PartnerStrip } from "@/components/brand/partner-logos";
import { PortalHeader } from "@/components/portal/portal-header";
import { MeetingRequestPanel } from "@/components/requests/meeting-request-panel";
import { Button } from "@/components/ui/button";
import { appConfig } from "@/lib/config";
import { requestMetaFrom } from "@/lib/audit";
import { requirePortalUser } from "@/lib/authz";
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
    ["Region", project.region],
    ["Sector", project.sector],
    ["PPP model", project.pppModel],
    ["Indicative size", size ?? "TBC"],
    ["Development stage", project.developmentStage],
    ["Project type", PROJECT_TYPE_LABEL[project.projectType]],
    [
      "Published",
      project.publishedAt ? date.format(project.publishedAt) : null,
    ],
  ];

  return (
    <>
      <PortalHeader name={user.name} viewer={viewer} />
      <main className="mx-auto flex w-full max-w-page flex-1 flex-col gap-6 px-4 py-8 sm:px-8 sm:py-10">
        <div>
          <nav
            aria-label="Breadcrumb"
            className="text-sm text-muted-foreground"
          >
            <ol className="flex flex-wrap items-center gap-1">
              <li>
                <Link href="/pipeline" className="link">
                  Pipeline
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li>
                <Link
                  href={pipelineHref({ country: project.country.iso3 })}
                  className="link"
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

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-stretch">
          {/* A clean frame around the teaser with its own download button (22 Nov styling pass). */}
          <section
            aria-labelledby="teaser-heading"
            className="overflow-hidden rounded-xl border border-water-100 bg-card shadow-sm lg:self-start"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-water-100 bg-water-50/60 px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <h2
                  id="teaser-heading"
                  className="text-sm font-semibold text-brand-navy"
                >
                  Project teaser
                </h2>
                {teaser ? (
                  <p className="truncate text-xs text-muted-foreground">
                    {teaser.filename} · {formatBytes(teaser.sizeBytes)} ·
                    version {teaser.version}
                  </p>
                ) : null}
              </div>
              {teaser?.canDownload ? (
                <Button asChild size="sm">
                  <a href={teaserFileHref(teaser.id, "download")} download>
                    <Download aria-hidden="true" />
                    Download teaser
                  </a>
                </Button>
              ) : null}
            </div>
            <div className="p-3 sm:p-4">
              <TeaserViewer teaser={teaser} title={project.title} />
            </div>
            <p className="border-t border-water-100 px-4 py-3 text-xs text-muted-foreground sm:px-5">
              {teaser?.canOpen && !teaser.canDownload
                ? "The country has switched off downloads for this teaser; you can read it on this page. "
                : ""}
              Access is personal and logged.
            </p>
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

            {/* Stays in view while the teaser is read (desktop). */}
            <div className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:rounded-xl">
              <MeetingRequestPanel viewer={viewer} projectId={project.id} />
            </div>
          </div>
        </div>
        <PartnerStrip
          partners={appConfig.partners}
          className="mt-4 border-t border-water-100 pt-6"
        />
      </main>
    </>
  );
}
