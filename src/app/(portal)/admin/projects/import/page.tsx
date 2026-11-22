import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminSectionCard, AdminShell } from "@/components/admin/admin-shell";
import { MetadataImportForm } from "@/components/admin/metadata-import-form";
import { requirePortalUser } from "@/lib/authz";
import { canImportProjectMetadata } from "@/lib/authz/admin";

// Reads the session on the server before rendering, so it may block.
export const instant = false;

export const metadata: Metadata = { title: "Import project filters" };

/** CSV import of PPP model, size and development stage (M7, PLAN v0.3 0.5). */
export default async function ImportProjectFiltersPage() {
  const { user, viewer } = await requirePortalUser();
  if (!canImportProjectMetadata(viewer)) notFound();
  return (
    <AdminShell
      name={user.name}
      viewer={viewer}
      current="/admin/projects"
      title="Import project filters"
      intro="Fill in PPP model, size and development stage for many projects at once. Nothing is saved until you have checked the preview."
    >
      <AdminSectionCard
        title="1. Get the template"
        description={
          <>
            Download{" "}
            <a
              className="font-semibold text-primary underline-offset-4 hover:underline"
              href="/admin/exports/projects.csv"
            >
              the projects CSV
            </a>
            . It lists every project with its id. Fill in the columns ppp_model,
            size_min_usd_million, size_max_usd_million and development_stage
            (sizes in USD million). Leave a cell empty to keep what is stored;
            type a single - to clear it. Other columns are only used to find the
            project and are never changed.
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          Without the project_id column, a row is matched by iso3 and the exact
          title, when exactly one project fits.
        </p>
      </AdminSectionCard>
      <AdminSectionCard title="2. Check and apply">
        <MetadataImportForm />
      </AdminSectionCard>
    </AdminShell>
  );
}
