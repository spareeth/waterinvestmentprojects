import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PortalHeader } from "@/components/portal/portal-header";
import {
  CreateLinkForm,
  RevokeLinkForm,
} from "@/components/submission/upload-link-forms";
import { Tag } from "@/components/workspace/status-badge";
import {
  canManageUploadLinks,
  canUseWorkspace,
  requirePortalUser,
} from "@/lib/authz";
import { formatUaeTime } from "@/lib/submission/format";
import { defaultLinkExpiryDate } from "@/lib/submission/input";
import {
  getUploadLinkOverview,
  type UploadLinkSummary,
} from "@/lib/submission/service";

// Reads the session and the database on the server before rendering, so it may block.
export const instant = false;

export const metadata: Metadata = { title: "Upload links" };

const STATE_LABEL: Record<UploadLinkSummary["state"], string> = {
  valid: "Active",
  expired: "Expired",
  revoked: "Switched off",
  not_found: "None",
};

function LinkStatus({ link }: { link: UploadLinkSummary | null }) {
  if (!link) {
    return <p className="text-sm text-muted-foreground">No active link.</p>;
  }
  return (
    <div className="flex flex-col gap-1 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Tag>{STATE_LABEL[link.state]}</Tag>
        <span className="text-muted-foreground">
          until {formatUaeTime(link.expiresAt)}
        </span>
      </div>
      <span className="text-xs text-muted-foreground">
        Created {formatUaeTime(link.createdAt)} by {link.createdByName}.{" "}
        {link.submissions}{" "}
        {link.submissions === 1 ? "submission" : "submissions"} through this
        link.
      </span>
    </div>
  );
}

/** Admin: one teaser upload link per country, plus the generic fallback link (M0, PLAN v0.3 F0). */
export default async function UploadLinksPage() {
  const { user, viewer } = await requirePortalUser();
  if (!canManageUploadLinks(viewer)) notFound();
  const now = new Date();
  const overview = await getUploadLinkOverview(viewer, { now });
  const defaultDate = defaultLinkExpiryDate(now);

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
            Upload links
          </h1>
          <p className="mt-1 max-w-3xl text-muted-foreground">
            Send each Government its own link: the country is fixed by the link,
            and no account is needed. A new link replaces the old one at once.
            Links are shown only when created, so copy them straight into your
            email. Use the generic link only if a country has no link of its
            own; there the uploader chooses the country.
          </p>
        </div>

        <section
          aria-labelledby="generic-heading"
          className="rounded-xl border bg-card p-6"
        >
          <h2 id="generic-heading" className="text-lg font-semibold">
            Generic link (any country)
          </h2>
          <div className="mt-3 flex flex-col gap-4">
            <LinkStatus link={overview.generic} />
            <CreateLinkForm
              countryId={null}
              label="the generic link"
              defaultDate={defaultDate}
              replaces={overview.generic !== null}
            />
            {overview.generic && overview.generic.state !== "revoked" ? (
              <RevokeLinkForm
                linkId={overview.generic.id}
                label="the generic link"
              />
            ) : null}
          </div>
        </section>

        <section
          aria-labelledby="countries-heading"
          className="flex flex-col gap-3"
        >
          <h2 id="countries-heading" className="text-lg font-semibold">
            Country links
          </h2>
          {overview.countries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active countries yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {overview.countries.map((c) => (
                <li
                  key={c.id}
                  className="grid gap-4 rounded-xl border bg-card p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]"
                >
                  <div className="flex flex-col gap-2">
                    <h3 className="text-base font-semibold text-brand-navy">
                      {c.name}
                    </h3>
                    <LinkStatus link={c.link} />
                    <span className="text-xs text-muted-foreground">
                      {c.submissions}{" "}
                      {c.submissions === 1 ? "submission" : "submissions"} in
                      total.
                    </span>
                  </div>
                  <div className="flex flex-col gap-3">
                    <CreateLinkForm
                      countryId={c.id}
                      label={c.name}
                      defaultDate={defaultDate}
                      replaces={c.link !== null}
                    />
                    {c.link && c.link.state !== "revoked" ? (
                      <RevokeLinkForm linkId={c.link.id} label={c.name} />
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
