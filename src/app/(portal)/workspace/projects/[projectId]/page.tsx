import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PortalHeader } from "@/components/portal/portal-header";
import { Notice } from "@/components/workspace/form-controls";
import { ProjectForm } from "@/components/workspace/project-form";
import {
  DownloadForm,
  PublishForm,
  WithdrawForm,
} from "@/components/workspace/publish-panel";
import {
  ScanBadge,
  StatusBadge,
  Tag,
} from "@/components/workspace/status-badge";
import { TeaserUploadForm } from "@/components/workspace/teaser-upload-form";
import { requestMetaFrom } from "@/lib/audit";
import { requirePortalUser } from "@/lib/authz";
import { workspaceUploadAcknowledgement } from "@/lib/workspace/acknowledgement";
import { usdToMillion } from "@/lib/workspace/project-input";
import { getWorkspaceProject } from "@/lib/workspace/service";
import { formatBytes } from "@/lib/workspace/teaser-file";

// Reads the session and the database on the server before rendering, so it may block.
export const instant = false;

export const metadata: Metadata = { title: "Project" };

const dateTime = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Dubai",
});

/** Add or update a project teaser (PLAN F3/F4, mockup 04). */
export default async function WorkspaceProjectPage({
  params,
  searchParams,
}: PageProps<"/workspace/projects/[projectId]">) {
  const { projectId } = await params;
  const { created } = await searchParams;
  const { user, viewer } = await requirePortalUser();
  const data = await getWorkspaceProject(viewer, projectId, {
    meta: requestMetaFrom(await headers()),
  });
  if (!data) notFound();
  const { project, teasers, currentTeaser, permissions } = data;
  const countryName = project.country.name;
  const ackText = workspaceUploadAcknowledgement(permissions.onBehalf).text;
  const cleanCurrent =
    currentTeaser?.scanStatus === "CLEAN" ? currentTeaser : null;
  const published = project.status === "PUBLISHED";

  return (
    <>
      <PortalHeader name={user.name} showWorkspace />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-10 sm:px-8">
        <div>
          <Link
            href="/workspace"
            className="text-sm text-brand-teal hover:underline"
          >
            Back to my projects
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight text-brand-navy">
              {project.title}
            </h1>
            <StatusBadge status={project.status} />
          </div>
          <p className="mt-1 text-muted-foreground">
            {countryName} workspace. Only your country team and the Summit
            administrators can manage this workspace.
          </p>
        </div>
        {created ? (
          <Notice tone="success">
            Project saved as a draft. Now upload its teaser.
          </Notice>
        ) : null}

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-6">
            <section
              aria-labelledby="teaser-heading"
              className="rounded-xl border bg-card p-6 sm:p-8"
            >
              <h2 id="teaser-heading" className="text-lg font-semibold">
                Teaser
              </h2>
              {teasers.length > 0 ? (
                <ul className="mt-4 flex flex-col divide-y rounded-lg border">
                  {teasers.map((t) => (
                    <li
                      key={t.id}
                      className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex flex-col gap-1">
                        <span className="font-medium">
                          Version {t.version}: {t.filename}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatBytes(t.sizeBytes)} · uploaded{" "}
                          {dateTime.format(t.uploadedAt)} by{" "}
                          {t.uploadedBy?.name ??
                            `${t.submission.uploaderName} (upload link)`}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Consent given{" "}
                          {dateTime.format(t.submission.ackAcceptedAt)} by{" "}
                          {t.submission.uploaderName} · wording{" "}
                          {t.submission.ackTextVersion}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {t.supersededById === null ? (
                          <Tag>Current</Tag>
                        ) : (
                          <Tag>Replaced</Tag>
                        )}
                        <ScanBadge status={t.scanStatus} />
                        {t.scanStatus === "CLEAN" ? (
                          <a
                            href={`/files/${t.id}`}
                            target="_blank"
                            rel="noopener"
                            className="text-sm font-medium text-brand-teal hover:underline"
                          >
                            Open
                          </a>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  No teaser uploaded yet.
                </p>
              )}
              {permissions.uploadTeaser ? (
                <div className="mt-6">
                  <TeaserUploadForm
                    projectId={project.id}
                    nextVersion={(teasers[0]?.version ?? 0) + 1}
                    acknowledgementText={ackText}
                    defaultAllowDownload={currentTeaser?.allowDownload ?? true}
                  />
                </div>
              ) : null}
              <p className="mt-6 text-sm text-muted-foreground">
                Additional documents: not used for the Summit phase.
              </p>
            </section>

            <section
              aria-labelledby="fields-heading"
              className="rounded-xl border bg-card p-6 sm:p-8"
            >
              <h2 id="fields-heading" className="mb-4 text-lg font-semibold">
                Key facts
              </h2>
              <ProjectForm
                mode="edit"
                projectId={project.id}
                readOnly={!permissions.edit}
                defaults={{
                  title: project.title,
                  sector: project.sector,
                  projectType: project.projectType,
                  pppModel: project.pppModel ?? "",
                  sizeMinUsdMillion: usdToMillion(project.sizeMinUsd),
                  sizeMaxUsdMillion: usdToMillion(project.sizeMaxUsd),
                  developmentStage: project.developmentStage ?? "",
                }}
              />
            </section>
          </div>

          <aside className="flex flex-col gap-6">
            <section
              aria-labelledby="publish-heading"
              className="rounded-xl border bg-card p-6 sm:p-8"
            >
              {published ? (
                <>
                  <h2 id="publish-heading" className="text-lg font-semibold">
                    In the pipeline
                  </h2>
                  <p className="mt-1 mb-4 text-sm text-muted-foreground">
                    {project.publishedAt
                      ? `Published ${dateTime.format(project.publishedAt)}. `
                      : ""}
                    Invited investors and operators can see the current teaser.
                  </p>
                  {permissions.withdraw && cleanCurrent ? (
                    <div className="mb-6">
                      <DownloadForm
                        documentId={cleanCurrent.id}
                        allowDownload={cleanCurrent.allowDownload}
                      />
                    </div>
                  ) : null}
                  {permissions.withdraw ? (
                    <WithdrawForm projectId={project.id} />
                  ) : (
                    <Notice tone="info">
                      The Summit team can withdraw this project.
                    </Notice>
                  )}
                </>
              ) : (
                <>
                  <h2
                    id="publish-heading"
                    className="mb-4 text-lg font-semibold"
                  >
                    Before you publish
                  </h2>
                  {permissions.publish ? (
                    <PublishForm
                      projectId={project.id}
                      teaser={
                        cleanCurrent
                          ? {
                              version: cleanCurrent.version,
                              allowDownload: cleanCurrent.allowDownload,
                            }
                          : null
                      }
                    />
                  ) : (
                    <Notice tone="info">
                      The Summit team publishes projects to the pipeline.
                    </Notice>
                  )}
                </>
              )}
            </section>
          </aside>
        </div>
      </main>
    </>
  );
}
