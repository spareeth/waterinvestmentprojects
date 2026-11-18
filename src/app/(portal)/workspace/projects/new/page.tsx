import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PortalHeader } from "@/components/portal/portal-header";
import { ProjectForm } from "@/components/workspace/project-form";
import { canUseWorkspace, requirePortalUser } from "@/lib/authz";
import { listWorkspaceCountries } from "@/lib/workspace/service";

// Reads the session and the database on the server before rendering, so it may block.
export const instant = false;

export const metadata: Metadata = { title: "Add a project" };

export default async function NewProjectPage() {
  const { user, viewer } = await requirePortalUser();
  if (!canUseWorkspace(viewer)) notFound();
  const countries = await listWorkspaceCountries(viewer);
  if (countries.length === 0) notFound();
  return (
    <>
      <PortalHeader name={user.name} showWorkspace />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10 sm:px-8">
        <div>
          <Link
            href="/workspace"
            className="text-sm text-brand-teal hover:underline"
          >
            Back to my projects
          </Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-brand-navy">
            Add a project
          </h1>
          <p className="mt-1 text-muted-foreground">
            The project is saved as a draft. Only your country team and the
            Summit administrators can see drafts. Upload the teaser on the next
            page.
          </p>
        </div>
        <section className="rounded-xl border bg-card p-6 sm:p-8">
          <ProjectForm
            mode="create"
            countries={countries}
            defaults={{ projectType: "SUMMIT_PIPELINE" }}
          />
        </section>
      </main>
    </>
  );
}
