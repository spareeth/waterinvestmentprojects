import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PortalHeader } from "@/components/portal/portal-header";
import { SubmissionForm } from "@/components/submission/submission-form";
import { canSubmitFromWorkspace, requirePortalUser } from "@/lib/authz";
import { appConfig } from "@/lib/config";
import { listWorkspaceSubmissionCountries } from "@/lib/submission/service";
import { submitWorkspaceTeasersAction } from "./actions";

// Reads the session and the database on the server before rendering, so it may block.
export const instant = false;

export const metadata: Metadata = { title: "Add project" };

/**
 * My projects, "Add project" (22 Nov, user request): a country focal point sends one-page teasers with the same
 * form as the country upload link (sector per teaser, one acknowledgement), without needing the link.
 */
export default async function WorkspaceUploadPage() {
  const { user, viewer } = await requirePortalUser();
  if (!canSubmitFromWorkspace(viewer)) notFound();
  const countries = await listWorkspaceSubmissionCountries(viewer);
  const single = countries.length === 1 ? countries[0] : null;
  return (
    <>
      <PortalHeader name={user.name} viewer={viewer} />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10 sm:px-8">
        <div>
          <Link
            href="/workspace"
            className="text-sm text-brand-teal hover:underline"
          >
            Back to my projects
          </Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-brand-navy">
            Add project
          </h1>
          <p className="mt-1 text-muted-foreground">
            Send one-page project teasers for{" "}
            {single ? single.name : "your country"}, one file per project. Each
            becomes a draft project in My projects; the Summit team checks every
            teaser before it is shared with the invited participants.
          </p>
        </div>
        <section className="rounded-xl border bg-card p-6 sm:p-8">
          {countries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Your country is not open for uploads at the moment. Please contact
              the Summit team.
            </p>
          ) : (
            <SubmissionForm
              action={submitWorkspaceTeasersAction}
              countryName={single ? single.name : null}
              countries={countries}
              acknowledgementText={appConfig.uploadAcknowledgement.text}
              defaults={{
                uploaderName: user.name,
                uploaderEmail: user.email,
                governmentOrganisation: user.organisation ?? "",
              }}
              workspace
            />
          )}
        </section>
      </main>
    </>
  );
}
