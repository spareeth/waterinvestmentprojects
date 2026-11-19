import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminSectionCard, AdminShell } from "@/components/admin/admin-shell";
import { Tag } from "@/components/workspace/status-badge";
import { CountryStatus } from "@/generated/prisma/enums";
import { canUseWorkspace, requirePortalUser } from "@/lib/authz";
import { canExportKind } from "@/lib/authz/admin";
import { listAdminCountries } from "@/lib/admin/countries";

// Reads the session and the database on the server before rendering, so it may block.
export const instant = false;

export const metadata: Metadata = { title: "Exports" };

const linkClass =
  "font-semibold text-primary underline-offset-4 hover:underline";

/** Admin exports (M7, PLAN v0.3 F7 and 0.14). Each download is recorded in the audit log. */
export default async function AdminExportsPage() {
  const { user, viewer } = await requirePortalUser();
  if (!canExportKind(viewer, "projects")) notFound();
  const countries = await listAdminCountries(viewer);
  const files = [
    {
      href: "/admin/exports/projects.csv",
      label: "Projects",
      text: "Every project with its filters and current teaser. Also the template for the filter import.",
    },
    {
      href: "/admin/exports/submissions.csv",
      label: "Submissions",
      text: "One row per teaser file: who uploaded it, when, and the consent given (wording version and time).",
    },
    {
      href: "/admin/exports/contacts.csv",
      label: "Contacts",
      text: "Focal points and WBG coordinators of every country, with their linked accounts.",
    },
    {
      href: "/admin/exports/accounts.csv",
      label: "Accounts",
      text: "Names, roles, countries and status. No passwords or other secrets.",
    },
    {
      href: "/inbox/export",
      label: "Meeting requests",
      text: "Every bilateral meeting request and decision (also on the meeting requests page).",
    },
    ...(canExportKind(viewer, "audit")
      ? [
          {
            href: "/admin/exports/audit.csv",
            label: "Audit log",
            text: "Every recorded action (Terra platform administrators only).",
          },
        ]
      : []),
  ];

  return (
    <AdminShell
      name={user.name}
      showWorkspace={canUseWorkspace(viewer)}
      current="/admin/exports"
      title="Exports"
      intro="CSV files open in Excel. Times are in UTC. Every download is recorded in the audit log; handle the files as confidential."
    >
      <AdminSectionCard title="Whole portal">
        <ul className="flex flex-col gap-3">
          {files.map((f) => (
            <li key={f.href} className="flex flex-col gap-0.5">
              <a href={f.href} className={linkClass}>
                {f.label} (CSV)
              </a>
              <span className="text-sm text-muted-foreground">{f.text}</span>
            </li>
          ))}
        </ul>
      </AdminSectionCard>

      <AdminSectionCard
        title="One country"
        description="Everything the portal holds for a country as one ZIP: projects, submissions with consent, contacts, meeting requests and every teaser version. For handing data back to the country or retiring the portal."
      >
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {countries.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2">
              <a
                href={`/admin/exports/country/${c.iso3}`}
                className={linkClass}
              >
                {c.name} (ZIP)
              </a>
              {c.status === CountryStatus.INACTIVE ? (
                <Tag>Switched off</Tag>
              ) : null}
            </li>
          ))}
        </ul>
      </AdminSectionCard>
    </AdminShell>
  );
}
